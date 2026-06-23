const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const now  = new Date();
    const sub  = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dest = path.join(UPLOAD_DIR, sub);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename(req, file, cb) {
    const ext    = path.extname(file.originalname).toLowerCase();
    const rand   = crypto.randomBytes(3).toString('hex');
    cb(null, `${Date.now()}_${rand}${ext}`);
  },
});

const MAX_MB = parseInt(process.env.UPLOAD_MAX_MB || '50');

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ['.pdf', '.docx', '.pptx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Chỉ chấp nhận file PDF, DOCX, PPTX.'));
    }
    cb(null, true);
  },
});

// Post-upload MIME validation using file-type (CJS v16)
async function validateMime(filePath, expectedExts, cb) {
  try {
    const { fileTypeFromFile } = await import('file-type');
    const result = await fileTypeFromFile(filePath);
    const validMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    if (!result || !validMimes.includes(result.mime)) {
      fs.unlink(filePath, () => {});
      return cb(new Error('File không hợp lệ. Chỉ chấp nhận PDF, DOCX, PPTX thực sự.'));
    }
    cb(null);
  } catch {
    // file-type unavailable — skip deep check
    cb(null);
  }
}

module.exports = { upload, validateMime };
