import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.OURWORLD_WEB_URL || 'http://127.0.0.1:8188';
const browser = await chromium.launch({ args: ['--no-proxy-server', '--disable-gpu'] });
const readyGlobe = `<!doctype html><script>
  window.OurworldGlobe = { ready: true, receive() {} };
  parent.postMessage({ bridgeVersion: 1, event: 'rendererReady', data: { texturesReady: true } }, location.origin);
</script>`;

async function mobilePage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.route('**/api/v1/**', route => {
    if (new URL(route.request().url()).pathname.includes('/users/')) {
      return route.fulfill({ status: 404, json: { message: 'No demo fixture' } });
    }
    return route.fulfill({ json: { items: [] } });
  });
  const page = await context.newPage();
  await page.clock.install();
  return { context, page };
}

try {
  const { context, page } = await mobilePage();
  const globeResponse = Promise.withResolvers();
  const atlasResponse = Promise.withResolvers();
  let globeRequests = 0;
  const attemptedAtlases = new Set();
  await context.route('**/globe/index.html', async route => {
    globeRequests++;
    await globeResponse.promise;
    await route.fulfill({ contentType: 'text/html', body: readyGlobe });
  });
  await context.route('**/globe/textures/planet-*.png', async route => {
    const filename = new URL(route.request().url()).pathname.split('/').at(-1);
    attemptedAtlases.add(filename);
    await atlasResponse.promise;
    if (filename === 'planet-chat.png') return route.fulfill({ status: 503 });
    const body = await readFile(new URL(`../../../packages/globe/public/textures/${filename}`, import.meta.url));
    return route.fulfill({ contentType: 'image/png', body });
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const nav = page.locator('.bottom-nav .planet-atlas');
  const loadedStills = () => nav.evaluateAll(icons => Promise.all(icons.map(async icon => {
    const background = getComputedStyle(icon).backgroundImage;
    if (!background.startsWith('url("data:image/webp;')) return false;
    const image = new Image();
    image.src = background.slice(5, -2);
    await image.decode();
    return image.naturalWidth === 96;
  })));

  await nav.first().waitFor();
  assert.deepEqual(await loadedStills(), [true, true, true, true]);
  await page.getByRole('button', { name: '搜索国家、城市、景点' }).tap();
  await page.getByPlaceholder('搜索国家、城市、景点').waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).tap();

  await page.clock.fastForward(17_000);
  await page.getByRole('button', { name: '重新加载地球', exact: true }).waitFor();
  assert.equal(globeRequests, 1, 'slow startup keeps the original iframe request');
  assert.equal(attemptedAtlases.size, 0, 'atlases do not compete with the startup downloads');
  assert.equal(await page.locator('.globe-fallback').count(), 0, 'the opening globe remains visible');

  const communityRequest = page.waitForRequest(request => request.url().endsWith('planet-community.png'));
  globeResponse.resolve();
  await page.locator('.globe-entrance-scene[data-entrance=settled]').waitFor();
  await communityRequest;
  assert.deepEqual(await loadedStills(), [true, true, true, true], 'delayed atlases leave all four stills intact');
  atlasResponse.resolve();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-planet="community"]')).backgroundImage.includes('planet-community.png'));
  assert.ok((await loadedStills())[2], 'a failed atlas leaves its still visible');
  await context.close();

  const second = await mobilePage();
  const firstRequest = Promise.withResolvers();
  let attempts = 0;
  await second.context.route('**/globe/index.html', async route => {
    if (++attempts === 1) {
      await firstRequest.promise;
      return;
    }
    await route.fulfill({ contentType: 'text/html', body: readyGlobe });
  });
  await second.page.goto(base, { waitUntil: 'domcontentloaded' });
  await second.page.locator('.globe-frame').waitFor();
  await second.page.clock.fastForward(17_000);
  await second.page.getByRole('button', { name: '重新加载地球', exact: true }).tap();
  await second.page.locator('.globe-entrance-scene[data-entrance=settled]').waitFor();
  assert.equal(attempts, 2, 'the visible retry button can restart a truly stalled attempt');
  firstRequest.resolve();
  await second.context.close();
  console.log('globe-first-open: stills, deferred atlases, slow startup and manual retry passed');
} finally {
  await browser.close();
}
