#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
project_dir=$(cd -- "$script_dir/../.." && pwd -P)
cd -- "$project_dir"

image=ourworld-api:local
base_url=http://127.0.0.1:8188

git_dir=$(git rev-parse --git-common-dir)
exec 9>"$git_dir/ourworld-release.lock"
flock -n 9 || { printf '%s\n' '已有 Ourworld 发布在执行。' >&2; exit 1; }

deploy_backend() {
    local expected_image=$1
    local containers
    "${compose[@]}" up -d --no-build --no-deps --scale api=2 --wait --wait-timeout 150 api worker &&
        containers=$("${compose[@]}" ps -q api worker) &&
        [[ $(wc -w <<< "$containers") -eq 3 ]] &&
        [[ $(xargs -r docker inspect --format '{{.Image}}' <<< "$containers" | sort -u) == "$expected_image" ]] &&
        "${compose[@]}" exec -T gateway nginx -s reload &&
        curl --fail --silent --show-error --retry 5 --retry-delay 1 --max-time 10 --output /dev/null "$base_url/api/v1/ready"
}

# Build the committed release without copying uncommitted changes or local environment files.
branch=${1:-$(git branch --show-current)}
revision=$(git rev-parse --verify "refs/heads/$branch^{commit}")
frontend_image="ourworld-frontend-release:$revision"
work_dir=$(mktemp -d --tmpdir="${TMPDIR:-$project_dir}" .backend-release.XXXXXXXX)
trap 'rm -rf -- "$work_dir"' EXIT
mkdir -- "$work_dir/source"
(umask 022; git archive "$revision" | tar -xf - -C "$work_dir/source")
compose=(docker compose --project-directory "$project_dir" -p ourworld -f "$work_dir/source/compose.yaml")

containers=$("${compose[@]}" ps -q api worker)
previous_image=
if [[ -n $containers ]]; then
    mapfile -t ids <<< "$containers"
    previous_image=$(docker inspect --format '{{.Image}}' "${ids[@]}" | sort -u)
    if [[ -z $previous_image || $previous_image == *$'\n'* ]]; then
        printf '%s\n' 'API 和 worker 未使用同一个可回滚镜像，请先检查当前部署。' >&2
        exit 1
    fi
fi
if [[ -n $previous_image ]]; then
    rollback_image="ourworld-api:rollback-${previous_image:7:12}"
    docker image tag "$previous_image" "$rollback_image"
fi

docker build --file "$work_dir/source/scripts/deploy/backend.Dockerfile" --target api \
    --label "org.opencontainers.image.revision=$revision" \
    --iidfile "$work_dir/image-id" "$work_dir/source"
docker build --target frontend-release --label "org.opencontainers.image.revision=$revision" \
    --iidfile "$work_dir/frontend-image-id" "$work_dir/source"
candidate=$(docker image inspect --format '{{.Id}}' "$(cat -- "$work_dir/image-id")")
docker image tag "$(cat -- "$work_dir/frontend-image-id")" "$frontend_image"

# A container from the old configuration can still be writing to the release volume.
legacy_watcher=$(docker ps -q --filter label=com.docker.compose.project=ourworld \
    --filter label=com.docker.compose.service=frontend-watch)
if [[ -n $legacy_watcher ]]; then
    xargs -r docker stop <<< "$legacy_watcher"
fi

docker image tag "$candidate" "$image"
if ! "${compose[@]}" run --rm --no-deps migrate; then
    printf '%s\n' '数据库迁移失败，当前运行的 API 和 worker 保持在线。' >&2
    if [[ -n $previous_image ]]; then
        docker image tag "$rollback_image" "$image"
    fi
    exit 1
fi
if deploy_backend "$candidate"; then
    previous_frontend=$(curl --fail --silent --max-time 5 "$base_url/frontend-version.json") || previous_frontend=
    if OURWORLD_FRONTEND_RELEASE_IMAGE="$frontend_image" "${compose[@]}" run --rm --no-deps -T frontend-release "$revision"; then
        if ! metadata=$(curl --fail --silent --show-error --retry 5 --retry-delay 1 --max-time 10 "$base_url/frontend-version.json") ||
            [[ $metadata != *\"revision\":\"$revision\"* ]]; then
            printf '%s\n' '前端发布已执行，但网关返回的版本无法确认。后端保持新版。' >&2
            exit 1
        fi
        printf 'Ourworld 前后端已就绪，提交 %s\n' "$revision"
        exit 0
    fi
    if [[ -z $previous_frontend ]] ||
        ! metadata=$(curl --fail --silent --max-time 5 "$base_url/frontend-version.json") ||
        [[ $metadata != "$previous_frontend" ]]; then
        printf '%s\n' '无法确认前端是否已切换，后端保持新版。' >&2
        exit 1
    fi
    printf '%s\n' '前端发布失败，原前端仍在服务。' >&2
else
    printf '%s\n' '新版后端未通过部署或就绪检查，原前端仍在服务。' >&2
fi

if [[ -n $previous_image ]]; then
    if docker image tag "$rollback_image" "$image" && deploy_backend "$previous_image"; then
        printf '已恢复 %s\n' "$rollback_image" >&2
    else
        printf '回滚未通过检查，保留镜像 %s\n' "$rollback_image" >&2
    fi
fi
exit 1
