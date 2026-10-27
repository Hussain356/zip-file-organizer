const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { organizeZip, getFolderName, OrganizerError } = require('../src/organizer');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zip-organizer-test-'));
}

function buildZip(dir, files) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content));
  }
  const file = path.join(dir, 'input.zip');
  zip.writeZip(file);
  return file;
}

function listNames(zipPath) {
  return new AdmZip(zipPath).getEntries().map((e) => e.entryName).sort();
}

test('getFolderName uses a lowercase extension or no_extension', () => {
  assert.equal(getFolderName('photo.JPG'), 'jpg');
  assert.equal(getFolderName('archive.tar.gz'), 'gz');
  assert.equal(getFolderName('README'), 'no_extension');
  assert.equal(getFolderName('.gitignore'), 'no_extension');
});

test('sorts files into folders by extension, ignoring original paths', () => {
  const dir = makeTempDir();
  const input = buildZip(dir, {
    'report.pdf': 'a',
    'holiday/photo1.JPG': 'b',
    'holiday/photo2.jpg': 'c',
    'notes.txt': 'd',
    'old.v2/noext': 'e',
  });
  const output = path.join(dir, 'out.zip');

  const result = organizeZip(input, output);

  assert.equal(result.fileCount, 5);
  assert.deepEqual(listNames(output), [
    'jpg/photo1.JPG',
    'jpg/photo2.jpg',
    'no_extension/noext',
    'pdf/report.pdf',
    'txt/notes.txt',
  ]);
  assert.deepEqual(result.folders[0], ['jpg', 2]);
});

test('renames duplicate file names instead of overwriting them', () => {
  const dir = makeTempDir();
  const input = buildZip(dir, { 'a/note.txt': '1', 'b/note.txt': '2', 'c/NOTE.txt': '3' });
  const output = path.join(dir, 'out.zip');

  organizeZip(input, output);

  assert.deepEqual(listNames(output), ['txt/NOTE (2).txt', 'txt/note (1).txt', 'txt/note.txt']);
});

test('skips hidden files and macOS metadata', () => {
  const dir = makeTempDir();
  const input = buildZip(dir, {
    'keep.txt': 'x',
    '.hidden': 'y',
    '__MACOSX/._keep.txt': 'z',
  });
  const output = path.join(dir, 'out.zip');

  const result = organizeZip(input, output);

  assert.equal(result.fileCount, 1);
  assert.deepEqual(listNames(output), ['txt/keep.txt']);
});

test('rejects a ZIP with no files', () => {
  const dir = makeTempDir();
  const input = buildZip(dir, { '.hidden': 'y' });
  assert.throws(() => organizeZip(input, path.join(dir, 'out.zip')), OrganizerError);
});

test('rejects a corrupted ZIP', () => {
  const dir = makeTempDir();
  const input = path.join(dir, 'fake.zip');
  fs.writeFileSync(input, 'this is not a zip');
  assert.throws(() => organizeZip(input, path.join(dir, 'out.zip')), /corrupted/);
});

test('enforces file count and size limits', () => {
  const dir = makeTempDir();
  const input = buildZip(dir, { 'a.txt': '12345', 'b.txt': '12345' });
  const output = path.join(dir, 'out.zip');

  assert.throws(() => organizeZip(input, output, { maxEntries: 1, maxTotalBytes: 100 }), /Too many files/);
  assert.throws(() => organizeZip(input, output, { maxEntries: 10, maxTotalBytes: 5 }), /too large/);
});
