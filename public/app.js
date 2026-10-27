const MAX_SIZE = 50 * 1024 * 1024; // 50 MB, same as the server limit

const form = document.getElementById('upload-form');
const input = document.getElementById('zipfile');
const dropzone = document.getElementById('dropzone');
const fileName = document.getElementById('file-name');
const button = document.getElementById('submit-btn');
const status = document.getElementById('status');
const result = document.getElementById('result');
const resultList = document.getElementById('result-list');
const downloadAgain = document.getElementById('download-again');

let downloadUrl = null;

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

function validate(file) {
  if (!file.name.toLowerCase().endsWith('.zip')) return 'Please choose a .zip file.';
  if (file.size > MAX_SIZE) return 'File is too large. Maximum size is 50 MB.';
  return '';
}

function showSelectedFile() {
  const file = input.files[0];
  result.hidden = true;
  if (!file) {
    fileName.hidden = true;
    return;
  }
  fileName.textContent = file.name;
  fileName.hidden = false;
  const error = validate(file);
  setStatus(error, error ? 'error' : '');
}

function renderSummary(summary) {
  resultList.replaceChildren();
  const total = document.createElement('li');
  total.textContent = `${summary.fileCount} file${summary.fileCount === 1 ? '' : 's'} organized:`;
  resultList.append(total);

  for (const [folder, count] of summary.folders) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = `${folder}/`;
    item.append(name, ` ${count} file${count === 1 ? '' : 's'}`);
    resultList.append(item);
  }
  if (summary.other > 0) {
    const item = document.createElement('li');
    item.textContent = `and ${summary.other} more in other folders`;
    resultList.append(item);
  }
}

function startDownload(blob) {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);
  downloadAgain.href = downloadUrl;
  downloadAgain.click();
}

input.addEventListener('change', showSelectedFile);

['dragenter', 'dragover'].forEach((type) =>
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  })
);
['dragleave', 'drop'].forEach((type) =>
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
  })
);
dropzone.addEventListener('drop', (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  showSelectedFile();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = input.files[0];
  if (!file) return setStatus('Please choose a ZIP file first.', 'error');
  const error = validate(file);
  if (error) return setStatus(error, 'error');

  button.disabled = true;
  button.textContent = 'Organizing...';
  setStatus('Uploading and organizing your ZIP file...');
  result.hidden = true;

  try {
    const response = await fetch('/upload', { method: 'POST', body: new FormData(form) });
    if (!response.ok) {
      setStatus((await response.text()) || 'Something went wrong. Please try again.', 'error');
      return;
    }
    const summary = JSON.parse(response.headers.get('X-Summary') || '{"fileCount":0,"folders":[],"other":0}');
    startDownload(await response.blob());
    renderSummary(summary);
    result.hidden = false;
    setStatus('');
  } catch {
    setStatus('Could not reach the server. Check your connection and try again.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Upload and Organize';
  }
});
