const path = require('path');
const AdmZip = require('adm-zip');

const DEFAULT_LIMITS = {
  maxEntries: 5000, // max files inside one ZIP
  maxTotalBytes: 500 * 1024 * 1024, // max total size after unzipping
};

class OrganizerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrganizerError';
  }
}

/** Folder for a file: its lowercase extension, or "no_extension". */
function getFolderName(fileName) {
  const ext = path
    .extname(fileName)
    .replace('.', '')
    .toLowerCase()
    .replace(/[^a-z0-9_+-]/g, '_')
    .slice(0, 20);
  return ext || 'no_extension';
}

/** Skip folders, macOS metadata, hidden files, and unsafe paths like "../". */
function isSafeEntry(entry) {
  const name = entry.entryName;
  return (
    !entry.isDirectory &&
    !name.startsWith('__MACOSX/') &&
    !path.basename(name).startsWith('.') &&
    !name.split('/').includes('..')
  );
}

/** Return a path that is not used yet: "a.txt", then "a (1).txt", "a (2).txt"... */
function uniquePath(usedPaths, folder, baseName) {
  const { name, ext } = path.parse(baseName);
  let candidate = `${folder}/${baseName}`;
  let count = 1;
  while (usedPaths.has(candidate.toLowerCase())) {
    candidate = `${folder}/${name} (${count})${ext}`;
    count++;
  }
  usedPaths.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Read a ZIP, sort its files into folders by extension, and write a new ZIP.
 * Returns { fileCount, folders: [[folderName, count], ...] } (largest first).
 */
function organizeZip(inputPath, outputPath, limits = DEFAULT_LIMITS) {
  let entries;
  try {
    entries = new AdmZip(inputPath).getEntries();
  } catch {
    throw new OrganizerError('Could not read this ZIP file. It may be corrupted.');
  }

  const files = entries.filter(isSafeEntry);
  if (files.length === 0) {
    throw new OrganizerError('The ZIP file has no files to organize.');
  }
  if (files.length > limits.maxEntries) {
    throw new OrganizerError(`Too many files. The limit is ${limits.maxEntries} files per ZIP.`);
  }
  const totalBytes = files.reduce((sum, entry) => sum + entry.header.size, 0);
  if (totalBytes > limits.maxTotalBytes) {
    throw new OrganizerError('The ZIP is too large once unzipped.');
  }

  const newZip = new AdmZip();
  const usedPaths = new Set();
  const counts = {};

  try {
    for (const entry of files) {
      const baseName = path.basename(entry.entryName);
      const folder = getFolderName(baseName);
      newZip.addFile(uniquePath(usedPaths, folder, baseName), entry.getData());
      counts[folder] = (counts[folder] || 0) + 1;
    }
    newZip.writeZip(outputPath);
  } catch {
    throw new OrganizerError('Could not read this ZIP file. It may be corrupted.');
  }

  const folders = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { fileCount: files.length, folders };
}

module.exports = { organizeZip, getFolderName, OrganizerError, DEFAULT_LIMITS };
