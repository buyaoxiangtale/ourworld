import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ourworld_tools import cli


class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def write(self, relative):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("fixture")
        return path

    def test_clean_removes_only_reproducible_output(self):
        output = self.write("apps/web/dist/index.html")
        protected = [
            self.write(name)
            for name in [
                ".env",
                ".data/database",
                "node_modules/tool/index.js",
                "apps/api/assets/photos/source.jpg",
                "keys/signing.key",
            ]
        ]
        with patch.object(cli, "ROOT", self.root), contextlib.redirect_stdout(io.StringIO()):
            cli.clean(False)
        self.assertFalse(output.exists())
        self.assertTrue(all(path.exists() for path in protected))

    def test_dry_run_does_not_remove_output(self):
        output = self.write("packages/globe/dist/index.html")
        with patch.object(cli, "ROOT", self.root), contextlib.redirect_stdout(io.StringIO()):
            cli.clean(True)
        self.assertTrue(output.exists())

    def test_generated_symlink_is_unlinked_without_following_it(self):
        with tempfile.TemporaryDirectory() as external:
            target = Path(external) / "keep.txt"
            target.write_text("source")
            link = self.root / "apps/web/public/globe"
            link.parent.mkdir(parents=True)
            link.symlink_to(external, target_is_directory=True)
            with patch.object(cli, "ROOT", self.root), contextlib.redirect_stdout(io.StringIO()):
                cli.clean(False)
            self.assertFalse(link.exists())
            self.assertTrue(target.exists())

    def test_parent_symlink_cannot_delete_outside_the_checkout(self):
        with tempfile.TemporaryDirectory() as external:
            target = Path(external) / "globe/index.html"
            target.parent.mkdir()
            target.write_text("keep")
            parent = self.root / "apps/web/public"
            parent.parent.mkdir(parents=True)
            parent.symlink_to(external, target_is_directory=True)
            with patch.object(cli, "ROOT", self.root), self.assertRaises(SystemExit):
                cli.clean(False)
            self.assertTrue(target.exists())


class CommandTests(unittest.TestCase):
    @patch("ourworld_tools.cli.subprocess.run")
    @patch("ourworld_tools.cli.shutil.which", return_value="/usr/bin/node")
    def test_failure_is_reported_to_the_caller(self, _which, execute):
        execute.return_value = subprocess.CompletedProcess([], 7)
        with self.assertRaises(SystemExit) as error:
            cli.run("node", "fixture.mjs")
        self.assertEqual(error.exception.code, 7)
        self.assertEqual(execute.call_args.kwargs["cwd"], cli.ROOT)

    @patch("ourworld_tools.cli.subprocess.run")
    @patch("ourworld_tools.cli.shutil.which", return_value=None)
    def test_missing_tool_does_not_start_a_process(self, _which, execute):
        with self.assertRaisesRegex(SystemExit, "缺少命令"):
            cli.run("missing")
        execute.assert_not_called()

    @patch("ourworld_tools.cli.node")
    def test_web_suite_uses_the_central_test_directory(self, node):
        cli.main(["test", "web", "profile-hobbies"])
        self.assertEqual(node.call_args.args, ("tests/e2e/web/profile-hobbies.mjs",))
        self.assertEqual(
            node.call_args.kwargs["env"]["PLAYWRIGHT_BROWSERS_PATH"],
            str(cli.ROOT / ".playwright-browsers"),
        )

    @patch("ourworld_tools.cli.node")
    def test_test_name_cannot_escape_the_suite_directory(self, node):
        with self.assertRaises(SystemExit):
            cli.main(["test", "web", "../../integration/api"])
        node.assert_not_called()

    @patch("ourworld_tools.cli.node")
    @patch("ourworld_tools.cli.run")
    def test_preview_suites_prepare_a_current_local_build(self, run, node):
        cli.main(["test", "web", "frontend-updates"])
        run.assert_called_once_with("npm", "run", "build")
        self.assertEqual(node.call_args.args, ("tests/e2e/web/frontend-updates.mjs",))

    @patch("ourworld_tools.cli.run")
    def test_setup_installs_the_javascript_lockfile(self, run):
        with patch.object(cli, "node") as node:
            cli.main(["setup"])
        run.assert_called_once_with("npm", "ci", "--no-audit", "--no-fund")
        node.assert_called_once_with("scripts/dev/setup.mjs")

    @patch("ourworld_tools.cli.run")
    def test_stop_retains_persistent_volumes(self, run):
        cli.main(["stop"])
        run.assert_called_once_with("docker", "compose", "stop")


if __name__ == "__main__":
    unittest.main()
