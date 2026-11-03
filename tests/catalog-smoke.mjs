import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8188/api/v1';
const checks = [];
async function json(path, options = {}) {
 const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(20000) });
 const body = await response.json();
 assert(response.ok, `${path}: ${response.status} ${body.code || ''}`);
 return body;
}
try {
 const countries = (await json('/places?kind=country')).items;
 assert(countries.length >= 18);
 const artwork = new Set();
 for (const country of countries) {
  assert(country.description.zh.length > 120 && country.description.en.length > 200, country.id + ' needs distinct bilingual content');
  assert(country.image.includes('/seed/country/'), country.id + ' needs country artwork');
  const image = await fetch(new URL(country.image, base));
  assert(image.ok, country.id + ' image must load');
  const bytes = await image.arrayBuffer();
  artwork.add(createHash('sha256').update(new Uint8Array(bytes)).digest('hex'));
  const png = await fetch(new URL(country.image.replace(/\.svg$/, '.png'), base));
  const signature = new Uint8Array(await png.arrayBuffer());
  assert(png.ok && signature[0] === 137 && signature[1] === 80 && signature[2] === 78 && signature[3] === 71, country.id + ' native PNG must decode');
 }
 assert.equal(artwork.size, countries.length, 'Country illustrations must differ');
 checks.push(`${countries.length} countries have substantial bilingual content and distinct working SVG/PNG artwork`);
 const guides = ['paris', 'tokyo', 'shanghai', 'lisbon', 'rio'];
 for (const slug of guides) {
  const profile = await json('/users/demo-guide-' + slug);
  assert.equal(profile.user.providerStatus, 'approved');
  assert(profile.user.cityIds.length && profile.user.tags.length && profile.user.quote);
  assert(profile.layout && profile.packages.length, 'Guide needs a published layout and a service');
 }
 checks.push('Five guide examples have real public profiles, service cities, tags, quotations and services');
 for (const slug of ['lin', 'anna', 'oliver']) {
  const profile = await json('/users/demo-traveler-' + slug);
  assert.equal(profile.user.providerStatus, 'none');
  assert(profile.layout && profile.posts.length, 'Traveller needs a published profile and journal');
 }
 checks.push('Three traveller examples have published profiles and journals, without provider approval');
 const session = await json('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'traveler@ourworld.test', password: process.env.DEMO_PASSWORD || 'Ourworld2026!' }) });
 const draft = await json('/profile/draft', { headers: { Authorization: 'Bearer ' + session.accessToken } });
 if (!process.env.LLM_API_KEY?.trim()) {
  const response = await fetch(base + '/profile/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken }, body: JSON.stringify({ prompt: '照片放最上面，城市和特长各半行', baseRevision: draft.revision }) });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, 'MODEL_NOT_CONFIGURED');
  checks.push('Unconfigured Agent returns an explicit model configuration error');
 }
 mkdirSync('artifacts', { recursive: true });
 writeFileSync('artifacts/catalog-smoke-report.json', JSON.stringify({ passed: true, base, checks }, null, 2));
 console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
 mkdirSync('artifacts', { recursive: true });
 writeFileSync('artifacts/catalog-smoke-report.json', JSON.stringify({ passed: false, base, checks, error: error.message }, null, 2));
 throw error;
}
