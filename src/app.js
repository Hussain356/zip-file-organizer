const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { organizeZip, OrganizerError } = require('./organizer');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB upload limit
const MAX_SUMMARY_FOLDERS = 12;

/** Delete a file without crashing if it is already gone. */
function removeFile(filePath) {
  if (filePath) fs.unlink(filePath, () => {});
}

function createApp({ uploadDir = path.join(__dirname, '..', 'uploads') } = {}) {
  const app = express();
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const upload = multer({
    dest: uploadDir,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    fileFilter: (req, file, cb) => {
      if (path.extname(file.originalname).toLowerCase() !== '.zip') {
        return cb(new Error('Only .zip files are allowed.'));
      }
      cb(null, true);
    },
  });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many uploads. Please try again in a few minutes.',
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/upload', uploadLimiter, (req, res) => {
    upload.single('zipfile')(req, res, (uploadError) => {
      if (uploadError) {
        const message =
          uploadError.code === 'LIMIT_FILE_SIZE'
            ? 'File is too large. Maximum size is 50 MB.'
            : uploadError.message;
        return res.status(400).send(message);
      }
      if (!req.file) {
        return res.status(400).send('No file uploaded.');
      }

      const uploadedPath = req.file.path;
      // Unique output file per request, so users never overwrite each other
      const outputPath = path.join(os.tmpdir(), `organized-${crypto.randomUUID()}.zip`);

      try {
        const result = organizeZip(uploadedPath, outputPath);
        const shown = result.folders.slice(0, MAX_SUMMARY_FOLDERS);
        const other = result.folders.slice(MAX_SUMMARY_FOLDERS).reduce((s, f) => s + f[1], 0);
        res.set('X-Summary', JSON.stringify({ fileCount: result.fileCount, folders: shown, other }));

        res.download(outputPath, 'organized_folders.zip', (downloadError) => {
          if (downloadError) console.error('Download error:', downloadError.message);
          removeFile(uploadedPath);
          removeFile(outputPath);
        });
      } catch (error) {
        removeFile(uploadedPath);
        removeFile(outputPath);
        if (error instanceof OrganizerError) {
          return res.status(400).send(error.message);
        }
        console.error('Unexpected error:', error);
        res.status(500).send('Something went wrong. Please try again.');
      }
    });
  });

  return app;
}

module.exports = { createApp, MAX_FILE_SIZE };
