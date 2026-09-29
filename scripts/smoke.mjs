import assert from 'node:assert/strict';
import { createApp } from '../dist/server/app.js';
import { SessionManager } from '../dist/server/session.js';

process.env.NODE_ENV = 'production';
const manager = new SessionManager(undefined, false);
const server = createApp(manager).listen(0, '127.0.0.1');

try {
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  const html = await page.text();
  assert.match(html, /MAX Chat/);
  const script = html.match(/src="([^"]+\.js)"/);
  assert(script, 'client script must be referenced');
  const asset = await fetch(new URL(script[1], origin));
  assert.equal(asset.status, 200);
  console.log('Production smoke passed: API, page, CSP and client asset.');
} finally {
  manager.dispose();
  await new Promise((resolve) => server.close(resolve));
}
