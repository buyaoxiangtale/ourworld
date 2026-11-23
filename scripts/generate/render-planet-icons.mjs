import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../packages/globe');
const stillRoot = resolve(root, '../../apps/web/src/assets/planet-icons');
const columns = 8;
const rows = 12;
const kinds = ['earth', 'community', 'chat', 'profile'];
const vite = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
try {
  await vite.listen();
  const address = vite.httpServer.address();
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/planet-atlas.css`);
    await mkdir(stillRoot, { recursive: true });
    for (const kind of kinds) {
      const data = await page.evaluate(async ({ kind, columns, rows }) => {
        const { createPlanetIcon } = await import('/src/planet-icons.ts');
        const model = await createPlanetIcon(kind, true);
        const size = 96;
        model.resize(size);
        const atlas = document.createElement('canvas');
        atlas.width = columns * size;
        atlas.height = rows * size;
        const context = atlas.getContext('2d');
        let firstFrame;
        for (let i = 0; i < columns * rows; i++) {
          model.render(i / (columns * rows));
          if (i === 0) firstFrame = model.canvas.toDataURL('image/webp', .83).split(',')[1];
          context.drawImage(model.canvas, i % columns * size, Math.floor(i / columns) * size);
        }
        model.dispose();
        return { atlas: atlas.toDataURL('image/png').split(',')[1], firstFrame };
      }, { kind, columns, rows });
      const path = resolve(root, `public/textures/planet-${kind}.png`);
      await writeFile(path, Buffer.from(data.atlas, 'base64'));
      await chmod(path, 0o644);
      const still = resolve(stillRoot, `${kind}.webp`);
      await writeFile(still, Buffer.from(data.firstFrame, 'base64'));
      await chmod(still, 0o644);
    }
  } finally {
    await browser.close();
  }
} finally {
  await vite.close();
}
