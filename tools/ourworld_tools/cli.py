"""One command entry point; each language keeps its native dependency resolver."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB_TESTS = ROOT / "tests/e2e/web"
GENERATED = (
    "apps/api/dist",
    "apps/web/dist",
    "packages/contracts/dist",
    "packages/globe/dist",
    "apps/web/public/globe",
    "apps/web/public/openapi.json",
    "apps/android/app/src/main/assets/globe",
    "apps/ios/Resources/globe",
    "build",
    "dist",
    "coverage",
    "test-results",
    "playwright-report",
)


def run(*command: str, env: dict[str, str] | None = None) -> None:
    executable = shutil.which(command[0])
    if executable is None:
        raise SystemExit(f"缺少命令 {command[0]}；请按 README 安装对应工具。")
    print("+ " + " ".join(command), flush=True)
    result = subprocess.run([executable, *command[1:]], cwd=ROOT, env=env, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)


def node(script: str, *args: str, env: dict[str, str] | None = None) -> None:
    run("node", script, *args, env=env)


def test_tools() -> None:
    run(sys.executable, "-m", "unittest", "discover", "-s", "tests/tools", "-v")


def clean_paths(root: Path | None = None) -> list[Path]:
    """Only reproducible output is eligible; do not follow directory symlinks."""
    root = root or ROOT
    paths = [root / name for name in GENERATED]
    for folder in [root / "tools", root / "tests/tools", root / "scripts/assets"]:
        if folder.exists() and not folder.is_symlink():
            paths.extend(path for path in folder.rglob("__pycache__") if not path.is_symlink())
    return [path for path in paths if path.exists() or path.is_symlink()]


def clean(dry_run: bool) -> None:
    for path in clean_paths():
        if not path.parent.resolve().is_relative_to(ROOT.resolve()):
            raise SystemExit(f"拒绝清理仓库外的目录：{path}")
        # The allowlist contains no user data, dependencies, signing keys or source media.
        print(("would remove " if dry_run else "remove ") + str(path.relative_to(ROOT)))
        if not dry_run:
            if path.is_symlink() or path.is_file():
                path.unlink()
            else:
                shutil.rmtree(path)


def browser_env() -> dict[str, str]:
    env = dict(os.environ)
    env.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(ROOT / ".playwright-browsers"))
    env.setdefault("OURWORLD_WEB_URL", "http://127.0.0.1:8188")
    return env


def doctor() -> None:
    print(f"repository: {ROOT}\npython: {sys.version.split()[0]}")
    missing = []
    for name, arguments in [
        ("uv", ["--version"]),
        ("node", ["--version"]),
        ("npm", ["--version"]),
        ("docker", ["compose", "version"]),
    ]:
        executable = shutil.which(name)
        if not executable:
            missing.append(name)
            print(f"{name}: missing")
            continue
        result = subprocess.run(
            [executable, *arguments], capture_output=True, text=True, check=False
        )
        version = result.stdout.strip()
        print(f"{name}: {version or result.stderr.strip()}")
        if result.returncode or name == "node" and int(version.lstrip("v").split(".")[0]) < 24:
            missing.append(name)
    if missing:
        raise SystemExit("请先安装或更新：" + ", ".join(missing))


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="ourworld", description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    for name, help_text in {
        "doctor": "检查 uv、Node.js 24、npm 和 Docker Compose",
        "setup": "安装锁定的 JavaScript 依赖并初始化本地配置",
        "start": "构建并启动 Docker 服务，保留现有数据",
        "stop": "停止 Docker 服务，保留数据卷",
        "build": "构建应用并生成共享资源",
        "prepare": "生成设计令牌、API 文档及三端地球资源",
        "check": "运行类型检查、单元测试和 Python 工具检查",
        "browsers": "安装浏览器测试使用的 Chromium",
        "logs": "查看网关和 API 日志",
        "watch": "启动本地前端热更新预览",
    }.items():
        commands.add_parser(name, help=help_text)
    dev = commands.add_parser("dev", help="启动本地开发进程")
    dev.add_argument("app", choices=["web", "api", "worker"])
    tests = commands.add_parser("test", help="运行指定测试组")
    tests.add_argument("suite", choices=["unit", "tools", "web", "integration"])
    tests.add_argument("name", nargs="?", help="web 脚本名，或 api/catalog/recovery/frontend-release")
    tests.add_argument(
        "--execute", action="store_true", help="执行 recovery 套件的实际本地故障注入"
    )
    cleanup = commands.add_parser("clean", help="清理可再生成的构建输出")
    cleanup.add_argument("--dry-run", action="store_true")
    media = commands.add_parser("media", help="显式更新素材，不在构建中自动下载")
    media.add_argument("kind", choices=["photos", "fonts", "portraits"])
    media.add_argument("--manifest", type=Path, help="重新处理人像时使用的源记录 JSON")
    return result


def main(argv: list[str] | None = None) -> None:
    args = parser().parse_args(argv)
    if not (ROOT / "package.json").is_file():
        raise SystemExit("请在 Ourworld 源码仓库中运行此工具。")
    try:
        if args.command == "doctor":
            doctor()
        elif args.command == "setup":
            run("npm", "ci", "--no-audit", "--no-fund")
            node("scripts/dev/setup.mjs")
        elif args.command == "start":
            node("scripts/dev/start.mjs")
        elif args.command == "stop":
            run("docker", "compose", "stop")
        elif args.command == "build":
            run("npm", "run", "build")
        elif args.command == "prepare":
            run("npm", "run", "prepare:assets")
        elif args.command == "dev":
            if args.app == "web":
                run("npm", "run", "prepare:assets")
            run("npm", "run", f"dev:{args.app}")
        elif args.command == "browsers":
            node("node_modules/playwright/cli.js", "install", "chromium", env=browser_env())
        elif args.command == "logs":
            run("docker", "compose", "logs", "-f", "--tail=80", "gateway", "api")
        elif args.command == "watch":
            run("npm", "run", "prepare:assets")
            run("npm", "run", "frontend:watch")
        elif args.command == "clean":
            clean(args.dry_run)
        elif args.command == "check":
            run("npm", "run", "typecheck")
            run("npm", "test")
            test_tools()
            run("ruff", "check")
            run("ruff", "format", "--check")
        elif args.command == "test":
            if args.execute and not (args.suite == "integration" and args.name == "recovery"):
                raise SystemExit("--execute 仅用于 integration recovery。")
            if args.suite == "unit":
                run("npm", "test")
                test_tools()
            elif args.suite == "tools":
                test_tools()
            elif args.suite == "web":
                name = args.name or "profile-hobbies"
                if name in {"all", "frontend-updates", "globe-boundaries"}:
                    run("npm", "run", "build")
                if name == "all":
                    for script in sorted(WEB_TESTS.glob("*.mjs")):
                        node(str(script.relative_to(ROOT)), env=browser_env())
                elif (WEB_TESTS / f"{name}.mjs").is_file() and Path(name).name == name:
                    node(f"tests/e2e/web/{name}.mjs", env=browser_env())
                else:
                    raise SystemExit(
                        "未知的网页测试。可用："
                        + ", ".join(p.stem for p in sorted(WEB_TESTS.glob("*.mjs")))
                    )
            else:
                name = args.name or "api"
                if name not in ["api", "catalog", "recovery", "frontend-release"]:
                    raise SystemExit("集成测试应选择 api、catalog、recovery 或 frontend-release。")
                extra = ["--execute"] if args.execute else []
                run(
                    "node",
                    "--env-file-if-exists=.env",
                    f"tests/integration/{name}.mjs",
                    *extra,
                    env=browser_env(),
                )
        elif args.command == "media":
            if args.kind == "photos":
                run(sys.executable, "scripts/assets/collect-place-photos.py")
            elif args.kind == "fonts":
                node("scripts/assets/download-fonts.mjs")
            elif args.manifest:
                node("scripts/assets/prepare-portraits.mjs", str(args.manifest.resolve()))
            else:
                raise SystemExit("重新处理人像需要 --manifest 路径。")
    except KeyboardInterrupt:
        raise SystemExit(130) from None
