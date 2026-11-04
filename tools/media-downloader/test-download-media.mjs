import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { prepareTasks } from './download-media.mjs';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./download-media.mjs', import.meta.url));

test('rejects path traversal and destination collisions after JPG conversion', () => {
  const row = { imageId: 'https://example.com/test.png', name: 'x.png', folder: 'pic' };
  for (const folder of ['../outside', '/absolute', 'x/../../y', 'x\\y']) {
    assert.throws(() => prepareTasks([{ ...row, folder }]));
  }
  assert.throws(() => prepareTasks([row, { ...row, name: 'x.webp' }]), /重名/);
  assert.throws(() => prepareTasks([{ ...row, name: '../x.png' }]));
  assert.throws(() => prepareTasks([{ ...row, mediaId: 'https://example.com/audio.mp3' }]));
  assert.equal(prepareTasks([{ ...row, name: '320251262' }])[0].name, '320251262.jpg');
});

test('CLI downloads audio, converts transparent PNG to JPEG, retries, resumes, and reports failures', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jlpt-downloader-'));
  const png = await sharp({ create: { width: 16, height: 12, channels: 4,
    background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const audio = Buffer.from('ID3-exact-audio-fixture');
  const requests = new Map();
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const count = (requests.get(url.pathname) ?? 0) + 1;
    requests.set(url.pathname, count);
    if (url.pathname === '/retry.mp3' && count === 1) {
      response.writeHead(503); response.end('temporary'); return;
    }
    if (url.pathname === '/missing') { response.writeHead(404); response.end(); return; }
    if (url.pathname === '/bad-image') {
      response.writeHead(200, { 'content-type': 'image/png' }); response.end('invalid image'); return;
    }
    if (url.pathname === '/empty') { response.writeHead(200); response.end(); return; }
    const image = url.pathname.endsWith('.png');
    response.writeHead(200, { 'content-type': image ? 'image/png' : 'audio/mpeg' });
    response.end(image ? png : audio);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const input = path.join(directory, 'list.json');
    const output = path.join(directory, 'downloads');
    const rows = [
      { imageId: base + '/含中文.png', name: '320251262.png', folder: 'pic' },
      { mediaId: base + '/retry.mp3', name: '12.mp3', folder: '202512n3' },
    ];
    const noProxy = [process.env.NO_PROXY, process.env.no_proxy, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
    const env = { ...process.env, NO_PROXY: noProxy, no_proxy: noProxy };
    const run = (extra = []) => execute(process.execPath, [script, input, '--output', output,
      '--concurrency', '2', '--retries', '1', ...extra], { env });
    await fs.writeFile(input, JSON.stringify(rows));
    await run();
    const jpg = path.join(output, 'pic/320251262.jpg');
    const metadata = await sharp(jpg).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.equal(metadata.width, 16);
    assert.equal(metadata.height, 12);
    assert.equal(metadata.hasAlpha, false);
    const { data } = await sharp(jpg).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[0] > 235 && data[1] > 100 && data[1] < 160 && data[2] > 100);
    assert.deepEqual(await fs.readFile(path.join(output, '202512n3/12.mp3')), audio);
    assert.equal(requests.get('/retry.mp3'), 2);
    const before = [...requests];
    assert.match((await run()).stdout, /跳过 2/);
    assert.deepEqual([...requests], before);
    await run(['--overwrite']);
    assert.equal(requests.get('/retry.mp3'), 3);

    const failures = [
      { mediaId: base + '/missing', name: '404.mp3', folder: '202512n3' },
      { imageId: base + '/bad-image', name: 'bad.png', folder: 'pic' },
      { mediaId: base + '/empty', name: 'empty.mp3', folder: '202512n3' },
    ];
    await fs.writeFile(input, JSON.stringify(failures));
    await assert.rejects(run(), error => error.code === 1 && /失败 3/.test(error.stdout));
    const failed = JSON.parse(await fs.readFile(path.join(output, 'failed-downloads.json'), 'utf8'));
    assert.equal(failed.length, 3);
    assert.ok(failed.every(row => row.downloadError));
    assert.equal(requests.get('/missing'), 1, '404 is not retried');
    assert.equal(requests.get('/bad-image'), 2);
    assert.equal(requests.get('/empty'), 2);
    assert.ok(!(await fs.readdir(path.join(output, 'pic'))).some(name => name.endsWith('.part')));
    assert.ok(!(await fs.readdir(path.join(output, '202512n3'))).some(name => name.endsWith('.part')));
    await assert.rejects(fs.stat(path.join(output, 'pic/bad.jpg')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(output, '202512n3/empty.mp3')), { code: 'ENOENT' });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
