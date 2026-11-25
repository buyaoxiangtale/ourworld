#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
project_dir=$(cd -- "$script_dir/../.." && pwd -P)
cd -- "$project_dir"

compose=(docker compose --project-directory "$project_dir" -p ourworld)
image=ourworld-api:local
ready_url=http://127.0.0.1:8188/api/v1/ready

deploy_backend() {
    "${compose[@]}" up -d --no-build --no-deps --scale api=2 --wait --wait-timeout 150 api worker &&
        "${compose[@]}" exec -T gateway nginx -s reload &&
        curl --fail --silent --show-error --retry 5 --retry-delay 1 --max-time 10 --output /dev/null "$ready_url"
}

# Build the committed release without copying uncommitted changes or local environment files.
branch=${1:-$(git branch --show-current)}
revision=$(git rev-parse --verify "refs/heads/$branch^{commit}")
work_dir=$(mktemp -d --tmpdir="${TMPDIR:-$project_dir}" .backend-release.XXXXXXXX)
trap 'rm -rf -- "$work_dir"' EXIT
mkdir -- "$work_dir/source"
(umask 022; git archive "$revision" | tar -xf - -C "$work_dir/source")

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

docker build --file "$script_dir/backend.Dockerfile" --target api \
    --label "org.opencontainers.image.revision=$revision" \
    --iidfile "$work_dir/image-id" "$work_dir/source"
docker image tag "$(cat -- "$work_dir/image-id")" "$image"
if ! "${compose[@]}" run --rm --no-deps migrate; then
    printf '%s\n' '数据库迁移失败，当前运行的 API 和 worker 保持在线。' >&2
    if [[ -n $previous_image ]]; then
        docker image tag "$rollback_image" "$image"
    fi
    exit 1
fi
if deploy_backend; then
    printf 'OURWORLD 后端已就绪，提交 %s\n' "$revision"
    exit 0
fi

printf '%s\n' '新版未通过部署或就绪检查。' >&2
if [[ -n $previous_image ]]; then
    if docker image tag "$rollback_image" "$image" && deploy_backend; then
        printf '已恢复 %s\n' "$rollback_image" >&2
    else
        printf '回滚未通过检查，保留镜像 %s\n' "$rollback_image" >&2
    fi
fi
exit 1
