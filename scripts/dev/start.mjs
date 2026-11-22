import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
const run = (command, args) => execFileSync(command, args, {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, COMPOSE_BAKE: 'false' },
});

try {
  run(process.execPath, ['scripts/dev/setup.mjs']);
  run(docker, ['info', '--format', '{{.OSType}}']);
  console.log('Downloading local database, cache, file and mail services…');
  run(docker, ['compose', 'pull', 'postgres', 'redis', 'storage', 'mailpit']);
  // Separate builds also work with Windows workspace paths containing Chinese.
  console.log('Building the API…');
  run(docker, ['build', '--target', 'api', '--tag', 'ourworld-api:local', '.']);
  console.log('Building the web app…');
  run(docker, ['build', '--target', 'web', '--tag', 'ourworld-web:local', '.']);
  console.log('Building the frontend auto-deployment watcher…');
  run(docker, ['build', '--target', 'frontend-watch', '--tag', 'ourworld-frontend-watch:local', '.']);
  run(docker, ['compose', 'up', '-d', '--no-build', '--pull', 'never', '--scale', 'api=2']);
  // Resolve the current API container addresses after an image update.
  run(docker, ['compose', 'restart', 'gateway']);

  const env = readFileSync(resolve(root, '.env'), 'utf8');
  const port = Number(env.match(/^WEB_PORT\s*=\s*(\d+)\s*$/m)?.[1] || 8188);
  const local = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 45; i++) {
    try {
      const response = await fetch(local + '/api/v1/ready', { signal: AbortSignal.timeout(3000) });
      if (response.ok) { ready = true; break; }
    } catch { /* services may still be starting */ }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!ready) throw new Error('Gateway not ready. Inspect: docker compose logs --tail=80 api worker gateway');
  console.log(`Ourworld ready: ${local}\nAdmin: ${local}/admin\nMail: http://127.0.0.1:8025`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
