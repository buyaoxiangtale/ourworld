import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:8188';
const prefix = process.env.UI_ARTIFACT_PREFIX || 'bright-earth';
const artifact = suffix => `artifacts/${prefix}-${suffix}`;
const checks = [], errors = [];
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-gpu'] });
async function home(width, height) {
 const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if(message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))errors.push(message.text()); });
 const textureResponses=new Map();
 page.on('response',response=>{const match=response.url().match(/\/textures\/(earth-(?:day|night|bump|clouds)\.(?:jpg|png))/);if(match)textureResponses.set(match[1],response.status());});
 await page.addInitScript(() => {
  window.__ourworldRendererReady = false;
  window.addEventListener('message', event => {
   if (event.data?.bridgeVersion === 1 && event.data?.event === 'rendererReady') window.__ourworldRendererReady = true;
  });
 });
 await page.goto(base, { waitUntil: 'domcontentloaded' });
 await page.waitForFunction(() => window.__ourworldRendererReady, {}, { timeout: 25000 });
 if(process.env.UI_EXPECT_SATELLITE==='true'){
  for(const name of ['earth-day.jpg','earth-night.jpg','earth-bump.png','earth-clouds.png'])assert.equal(textureResponses.get(name),200,`Bundled ${name} must load`);
  checks.push(`${width}x${height}: four bundled Earth textures loaded`);
 }
 const homeText=(await page.locator('body').innerText()).trim();
 assert(homeText.length<60, 'Home must only retain the search prompt');
 assert.equal(await page.locator('h1:visible,h2:visible,.wordmark:visible,.explore-caption:visible,.desktop-aside:visible,.desktop-right:visible').count(),0,'Home must have no titles, branding or promotional copy');
 await page.getByRole('button',{name:/搜索|search|城市/i}).or(page.getByRole('searchbox')).or(page.getByPlaceholder(/搜索|search|城市/i)).first().waitFor({state:'visible'});
 assert.equal(await page.getByRole('navigation').getByRole('button').count(), 3);
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
 checks.push(`${width}x${height}: live globe and search, no promotional text, three icon navigation, no horizontal overflow`);
 return page;
}
try {
 const page = await home(390, 844);
 await page.screenshot({ path: artifact('mobile.png') });
 const tablet = await home(768, 1024);
 await tablet.screenshot({path:artifact('tablet.png')});
 await tablet.close();
 const desktop = await home(1440, 960);
 await desktop.screenshot({ path: artifact('desktop.png') });
 await desktop.close();
 await page.bringToFront();

 const response = await fetch(base + '/api/v1/places/country-france');
 assert(response.ok);
 const france = await response.json();
 assert(france.description.zh.length > 150, 'Country introduction must contain substantial content');
 assert(france.image, 'Country illustration must be supplied by the backend');
 const frame = page.frames().find(frame => frame.url().includes('/globe/'));
 assert(frame);
 await frame.evaluate(place => window.OurworldGlobe.receive({ bridgeVersion: 1, event: 'focusPlace', data: { place } }), france);
 await page.waitForTimeout(1100);
 const bounds = await page.locator('iframe').boundingBox();
 assert(bounds);
 await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
 await page.getByRole('dialog', { name: france.name.zh, exact: true }).waitFor({ state: 'visible' });
 await page.getByAltText(france.name.zh, { exact: true }).first().waitFor({ state: 'visible' });
 await page.getByAltText(france.name.zh, { exact: true }).first().evaluate(image => image.decode());
 assert(await page.getByAltText(france.name.zh, { exact: true }).first().evaluate(image => image.complete && image.naturalWidth > 0));
 checks.push('Actual globe click opens country detail with loaded country artwork');
 await page.screenshot({ path: artifact('country.png') });
 await page.getByRole('dialog', { name: france.name.zh, exact: true }).getByRole('button', { name: 'Close', exact: true }).first().click();
 await page.getByRole('navigation').getByRole('button').nth(2).click();
 await page.getByRole('button').filter({ hasText: 'Claire' }).first().click();
 await page.getByRole('dialog').last().locator('.profile-identity h2').filter({ hasText: 'Claire' }).waitFor({ state: 'visible' });
 checks.push('Guide example opens a real public profile');
 await page.screenshot({ path: artifact('guide.png') });
 const close = page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true });
 await close.first().click();
 await page.getByRole('button').filter({ hasText: '林予' }).first().click();
 await page.getByRole('dialog').last().locator('.profile-identity h2').filter({ hasText: '林予' }).waitFor({ state: 'visible' });
 checks.push('Traveller example opens a real public profile');
 await page.screenshot({ path: artifact('traveller.png') });
 assert.deepEqual(errors, []);
 checks.push('No browser page errors');
 writeFileSync(artifact('ui-report.json'), JSON.stringify({ passed: true, base, checks, errors }, null, 2));
 console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
 writeFileSync(artifact('ui-report.json'), JSON.stringify({ passed: false, base, checks, errors, error: error.message }, null, 2));
 throw error;
} finally { await browser.close(); }
