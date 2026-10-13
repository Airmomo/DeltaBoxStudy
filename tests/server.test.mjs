import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createStudyServer, projectRoot } from '../tools/serve.mjs';
import { verifyArchive } from '../tools/verify.mjs';

test('study resources match baseline manifest', async () => {
  const result = await verifyArchive();
  assert.deepEqual(result, { version: '1.3.0', verifiedFiles: 2768, mapCount: 6, pointRecords: 3710, author: '南神' });
});

test('project text and manifests use portable relative paths', async () => {
  const extensions = new Set(['.md', '.txt', '.html', '.css', '.js', '.mjs', '.json']);
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', '.cache', '.git', 'coverage'].includes(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(target);
      else if (extensions.has(path.extname(entry.name))) {
        const content = await readFile(target, 'utf-8');
        const relative = path.relative(projectRoot, target);
        assert.doesNotMatch(content, /(?<![A-Za-z0-9])[A-Za-z]:[\\/][A-Za-z0-9_. -]+[\\/]/, relative);
        assert.doesNotMatch(content, /(?:^|[\s"'=])\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+/, relative);
      }
    }
  }
  await scan(projectRoot);
  const resources = JSON.parse(await readFile(path.join(projectRoot, 'archive-manifest.json'), 'utf-8'));
  assert.deepEqual(Object.keys(resources).sort(), ['assetCount', 'files', 'sourceVersion', 'totalAssetBytes']);
  const sync = JSON.parse(await readFile(path.join(projectRoot, 'renderer/data/sync_manifest.json'), 'utf-8'));
  for (const target of Object.keys(sync.sha256)) assert.ok(target.startsWith('renderer/'), target);
});

test('read-only browser server preserves archive and contains study routes', async t => {
  const server = createStudyServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve);server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  await t.test('study home includes author and sponsorship', async () => {
    const response = await fetch(base+'/');const html = await response.text();
    assert.equal(response.status,200);assert.match(html,/南神/);assert.match(html,/sponsor-qr\.png/);
    assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
  });
  await t.test('demo injects adapters without changing original HTML', async () => {
    const original = await readFile(path.join(projectRoot,'renderer/overlay.html'));
    const response = await fetch(base+'/renderer/overlay.html');const html = await response.text();
    assert.equal(response.status,200);assert.match(html,/\/study\/bridge\.js/);assert.match(html,/\/study\/demo\.js/);
    assert.deepEqual(await readFile(path.join(projectRoot,'renderer/overlay.html')),original);
  });
  await t.test('source view returns byte-identical archive text', async () => {
    const response = await fetch(base+'/source/renderer/overlay.html');
    assert.match(response.headers.get('content-type'),/^text\/plain/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path.join(projectRoot,'renderer/overlay.html')));
  });
  await t.test('local sponsor asset is byte-identical', async () => {
    const response = await fetch(base+'/renderer/images/about/sponsor-qr.png');
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path.join(projectRoot,'renderer/images/about/sponsor-qr.png')));
  });
  await t.test('POST and unlisted or tooling paths are inaccessible', async () => {
    assert.equal((await fetch(base+'/',{method:'POST',body:'no changes'})).status,405);
    for (const target of ['/.git/config','/tools/serve.mjs','/.env','/unlisted/fixture.txt','/renderer/does-not-exist.js'])
      assert.equal((await fetch(base+target)).status,404,target);
  });
  await t.test('raw traversal, backslash and malformed URLs are rejected', async () => {
    async function status(target) {
      return new Promise((resolve,reject) => {
        http.get(base,{path:target},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);
      });
    }
    for (const target of ['/renderer/../../AGENTS.md','/renderer/%2e%2e/%2e%2e/AGENTS.md','/renderer/%5c..%5cAGENTS.md','/renderer/%00']) assert.equal(await status(target),403,target);
    assert.equal(await status('/renderer/%zz'),400);
  });
});
