const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { createApp } = require('../src/app');

let server;
let baseUrl;
let uploadDir;

before(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-organizer-uploads-'));
  server = createApp({ uploadDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function upload(name, buffer) {
  const form = new FormData();
  form.append('zipfile', new Blob([buffer]), name);
  return fetch(`${baseUrl}/upload`, { method: 'POST', body: form });
}

function sampleZip() {
  const zip = new AdmZip();
  zip.addFile('docs/report.pdf', Buffer.from('pdf'));
  zip.addFile('pic.png', Buffer.from('png'));
  return zip.toBuffer();
}

test('GET /health returns ok', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('POST /upload returns an organized ZIP and a summary header', async () => {
  const response = await upload('files.zip', sampleZip());
  assert.equal(response.status, 200);

  const summary = JSON.parse(response.headers.get('x-summary'));
  assert.equal(summary.fileCount, 2);

  const names = new AdmZip(Buffer.from(await response.arrayBuffer()))
    .getEntries()
    .map((e) => e.entryName)
    .sort();
  assert.deepEqual(names, ['pdf/report.pdf', 'png/pic.png']);
});

test('POST /upload rejects files that are not .zip', async () => {
  const response = await upload('notes.txt', Buffer.from('hello'));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Only .zip files/);
});

test('POST /upload rejects a corrupted ZIP', async () => {
  const response = await upload('fake.zip', Buffer.from('not a zip'));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /corrupted/);
});

test('POST /upload without a file returns 400', async () => {
  const response = await fetch(`${baseUrl}/upload`, { method: 'POST' });
  assert.equal(response.status, 400);
});

test('uploaded files are deleted after each request', async () => {
  await upload('files.zip', sampleZip());
  await upload('fake.zip', Buffer.from('not a zip'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(fs.readdirSync(uploadDir), []);
});
