import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {verifyReadingImages, verifiedReadingImageKeys} from './verify-reading-images.mjs';

const baseUrl = 'https://example.com';
const checklist = (...paths) => ({images: paths.map(uploadPath => ({uploadPath}))});
const jpeg = await sharp({create: {width: 80, height: 100, channels: 3, background: '#ffffff'}}).jpeg().toBuffer();
const response = () => new Response(jpeg, {headers: {'content-type': 'image/jpeg'}});

test('verification downloads and decodes each shared image once and records activation evidence', async () => {
  const calls = [];
  const report = await verifyReadingImages(checklist('pic/120250765.jpg', 'pic/120250765.jpg', 'pic/120250765-1.jpg'), {
    baseUrl, fetcher: async (url, options) => { calls.push(url); assert.equal(options.redirect, 'error'); return response(); },
  });
  assert.equal(report.status, 'passed'); assert.equal(calls.length, 2);
  assert.equal(report.images[0].width, 80); assert.equal(report.images[0].height, 100);
  assert.equal(report.images[0].bytes, jpeg.length);
  assert.deepEqual([...verifiedReadingImageKeys(report)], ['pic/120250765.jpg', 'pic/120250765-1.jpg']);
});

test('missing files, access denials and connection failures are distinct and cannot enable questions', async () => {
  for (const [fetcher, status] of [
    [async () => new Response('', {status: 404}), 'missing'],
    [async () => new Response('', {status: 403}), 'http-error'],
    [async () => { throw new Error('Proxy destination denied'); }, 'unreachable'],
  ]) {
    const report = await verifyReadingImages(checklist('pic/test.jpg'), {baseUrl, fetcher});
    assert.equal(report.status, 'failed'); assert.equal(report.images[0].status, status);
    assert.throws(() => verifiedReadingImageKeys(report), /must pass verification/);
  }
});

test('HTTP success with HTML, corrupt image bytes, tiny placeholders or oversized content fails decoding', async () => {
  const tiny = await sharp({create: {width: 1, height: 1, channels: 3, background: '#ffffff'}}).png().toBuffer();
  for (const [body, headers, maximumBytes] of [
    ['<html>Not an image</html>', {'content-type': 'text/html'}, 4096],
    ['broken JPEG', {'content-type': 'image/jpeg'}, 4096],
    [jpeg.subarray(0, Math.floor(jpeg.length / 2)), {'content-type': 'image/jpeg'}, 4096],
    [tiny, {'content-type': 'image/png'}, 4096],
    [jpeg, {'content-type': 'image/jpeg'}, 10],
    [jpeg, {'content-type': 'image/jpeg', 'content-length': '999999'}, 4096],
  ]) {
    const report = await verifyReadingImages(checklist('pic/test.jpg'), {baseUrl, maximumBytes, fetcher: async () => new Response(body, {headers})});
    assert.equal(report.status, 'failed'); assert.equal(report.images[0].status, 'invalid-image');
  }
});

test('unsafe object paths and changed verification evidence are rejected', async () => {
  await assert.rejects(verifyReadingImages(checklist('pic/../secret.jpg'), {baseUrl}), /Invalid checklist/);
  const report = await verifyReadingImages(checklist('pic/test.jpg'), {baseUrl, fetcher: async () => response()});
  for (const changed of [
    {...report, images: []},
    {...report, checkedAt: ''},
    {...report, images: [{...report.images[0], url: 'https://other.example.com/pic/test.jpg'}]},
    {...report, images: [{...report.images[0], sha256: ''}]},
    {...report, images: [...report.images, ...report.images]},
  ]) assert.throws(() => verifiedReadingImageKeys(changed));
});
