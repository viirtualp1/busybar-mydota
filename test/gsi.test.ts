import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCfg, parseLibraryFolders } from '../src/gsi/install';
import { GsiServer } from '../src/gsi/server';
import { demoPayload } from '../src/gsi/demo';
import { inMatch } from '../src/domain/state';
import { NOW } from './helpers';

const CFG = {
  endpoint: 'http://127.0.0.1:3080/',
  token: 'hunter2',
  throttleSec: 0.5,
  heartbeatSec: 10,
};

function server(overrides: Partial<ConstructorParameters<typeof GsiServer>[0]> = {}) {
  return new GsiServer({
    port: 0,
    host: '127.0.0.1',
    token: '',
    staleMs: 30_000,
    ...overrides,
  });
}

test('the generated cfg carries the endpoint, timings and every data block', () => {
  const cfg = buildCfg(CFG);

  assert.match(cfg, /^"busybar-mydota"/);
  assert.match(cfg, /"uri"\s+"http:\/\/127\.0\.0\.1:3080\/"/);
  assert.match(cfg, /"throttle"\s+"0\.5"/);
  assert.match(cfg, /"heartbeat"\s+"10\.0"/);
  assert.match(cfg, /"token"\s+"hunter2"/);
  for (const block of ['provider', 'map', 'player', 'hero', 'items', 'buildings']) {
    assert.match(cfg, new RegExp(`"${block}"\\s+"1"`), `${block} should be requested`);
  }
});

test('no token means no auth block at all', () => {
  assert.doesNotMatch(buildCfg({ ...CFG, token: '' }), /auth/);
});

test('a quote in a token cannot break out of the cfg', () => {
  const cfg = buildCfg({ ...CFG, token: 'a"b' });

  assert.match(cfg, /"token"\s+"ab"/);
  assert.equal(cfg.split('"').length % 2, 1, 'quotes stay balanced');
});

test('library roots are read out of the vdf, doubled separators and all', () => {
  const vdf = `"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
  }
  "1"
  {
    "path"    "D:\\\\SteamLibrary"
  }
}`;

  assert.deepEqual(parseLibraryFolders(vdf), [
    'C:\\Program Files (x86)\\Steam',
    'D:\\SteamLibrary',
  ]);
});

test('a payload handed straight to the server becomes the current match', () => {
  const gsi = server();
  gsi.accept(demoPayload(60_000, NOW), NOW);

  assert.equal(gsi.stats.packets, 1);
  assert.equal(inMatch(gsi.state(NOW)), true);
});

test('the feed going quiet reads as offline rather than a frozen game', () => {
  const gsi = server({ staleMs: 5000 });
  gsi.accept(demoPayload(60_000, NOW), NOW);

  assert.equal(inMatch(gsi.state(NOW + 4000)), true);
  assert.equal(gsi.state(NOW + 6000).present, false);
});

test('subscribers hear about every packet', () => {
  const seen: string[] = [];
  const gsi = server({ onState: (state) => seen.push(state.phase) });
  gsi.accept(demoPayload(0, NOW), NOW);
  gsi.accept(demoPayload(60_000, NOW), NOW);

  assert.deepEqual(seen, ['draft', 'live']);
});

test('a wrong token is refused over HTTP, a right one is not', async () => {
  const gsi = server({ token: 'hunter2', port: 43_181 });
  await gsi.start();

  try {
    const post = (token: string) =>
      fetch('http://127.0.0.1:43181/', {
        method: 'POST',
        body: JSON.stringify({ ...demoPayload(60_000, NOW), auth: { token } }),
      });

    assert.equal((await post('wrong')).status, 403);
    assert.equal((await post('hunter2')).status, 200);
    assert.equal(gsi.stats.packets, 1);
    assert.equal(gsi.stats.rejected, 1);
    assert.equal(inMatch(gsi.state()), true);
  } finally {
    await gsi.stop();
  }
});

test('a GET is answered with status text, not treated as a packet', async () => {
  const gsi = server({ port: 43_182 });
  await gsi.start();

  try {
    const response = await fetch('http://127.0.0.1:43182/');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /busybar-mydota/);
    assert.equal(gsi.stats.packets, 0);
  } finally {
    await gsi.stop();
  }
});

test('malformed json is rejected without taking the server down', async () => {
  const gsi = server({ port: 43_183 });
  await gsi.start();

  try {
    const response = await fetch('http://127.0.0.1:43183/', {
      method: 'POST',
      body: 'not json',
    });
    assert.equal(response.status, 400);
    assert.equal(gsi.stats.rejected, 1);
  } finally {
    await gsi.stop();
  }
});
