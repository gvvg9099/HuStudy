const router   = require('express').Router();
const path     = require('path');
const fs       = require('fs');
const db       = require('../db');
const { verifyToken, optionalToken } = require('../middleware/auth');
const { upload, validateMime }       = require('../middleware/upload');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

// ─── GET /api/documents ───────────────────────────────────────────────────────
router.get('/', optionalToken, async (req, res, next) => {
  try {
    const { q = '', subject = '', type = '', sort = 'newest', page = 1, limit = 12 } = req.query;
    const offset  = (parseInt(page) - 1) * parseInt(limit);
    const params  = [];
    let   where   = "d.status = 'APPROVED'";

    // Subject filter
    if (subject) {
      where += ' AND s.name = ?';
      params.push(subject);
    }

    // File type filter
    if (type && ['PDF','DOCX','PPTX'].includes(type.toUpperCase())) {
      where += ' AND d.file_type = ?';
      params.push(type.toUpperCase());
    }

    // Full-text or LIKE search
    if (q.trim()) {
      if (q.trim().length >= 3) {
        where += ' AND MATCH(d.title, d.description) AGAINST (? IN BOOLEAN MODE)';
        params.push(q.trim().split(/\s+/).map(w => `+${w}*`).join(' '));
      } else {
        where += ' AND (d.title LIKE ? OR d.description LIKE ?)';
        params.push(`%${q.trim()}%`, `%${q.trim()}%`);
      }
    }

    const orderBy = sort === 'downloads'
      ? 'ORDER BY d.download_count DESC, d.created_at DESC'
      : 'ORDER BY d.created_at DESC';

    // Count query
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM documents d
       JOIN subjects s ON s.id = d.subject_id WHERE ${where}`,
      params
    );

    // Data query
    const [rows] = await db.query(
      `SELECT d.id, d.title, d.description, d.file_type, d.file_size,
              d.download_count, d.status, d.created_at,
              s.name AS subject_name, s.color AS subject_color, s.bg AS subject_bg,
              u.name AS uploader_name
       FROM documents d
       JOIN subjects s ON s.id = d.subject_id
       JOIN users    u ON u.id = d.uploader_id
       WHERE ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // Mark is_favorited for authenticated user
    if (req.user && rows.length) {
      const ids = rows.map(r => r.id);
      const [favs] = await db.query(
        `SELECT document_id FROM favorites WHERE user_id = ? AND document_id IN (${ids.map(() => '?').join(',')})`,
        [req.user.id, ...ids]
      );
      const favSet = new Set(favs.map(f => f.document_id));
      rows.forEach(r => { r.is_favorited = favSet.has(r.id); });
    }

    res.json({
      data: rows,
      meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/documents/:id ───────────────────────────────────────────────────
router.get('/:id(\\d+)', optionalToken, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*, s.name AS subject_name, s.color AS subject_color, s.bg AS subject_bg,
              u.name AS uploader_name
       FROM documents d
       JOIN subjects s ON s.id = d.subject_id
       JOIN users    u ON u.id = d.uploader_id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });

    const doc = rows[0];
    // Non-approved documents only visible to owner or admin
    if (doc.status !== 'APPROVED') {
      if (!req.user || (req.user.id !== doc.uploader_id && req.user.role !== 'ADMIN')) {
        return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
      }
    }

    if (req.user) {
      const [[fav]] = await db.query(
        'SELECT id FROM favorites WHERE user_id = ? AND document_id = ?',
        [req.user.id, doc.id]
      );
      doc.is_favorited = !!fav;
    } else {
      doc.is_favorited = false;
    }

    res.json({ data: doc });
  } catch (err) { next(err); }
});

// ─── POST /api/documents (upload) ────────────────────────────────────────────
router.post('/', verifyToken, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Vui lòng chọn file.' });

  const filePath = req.file.path;
  const relPath  = path.relative(UPLOAD_DIR, filePath).replace(/\\/g, '/');

  // Async MIME validation
  validateMime(filePath, [], async (err) => {
    if (err) return res.status(422).json({ error: err.message });

    try {
      const { title, subject_id, description = '' } = req.body;
      if (!title || title.trim().length < 3)
        return res.status(400).json({ error: 'Tiêu đề phải có ít nhất 3 ký tự.' });
      if (!subject_id)
        return res.status(400).json({ error: 'Vui lòng chọn môn học.' });

      // Verify subject exists
      const [[subj]] = await db.query('SELECT id FROM subjects WHERE id = ?', [subject_id]);
      if (!subj) return res.status(400).json({ error: 'Môn học không tồn tại.' });

      const ext      = path.extname(req.file.originalname).toUpperCase().replace('.', '');
      const fileType = ['PDF','DOCX','PPTX'].includes(ext) ? ext : 'PDF';

      const [result] = await db.query(
        `INSERT INTO documents
           (title, description, subject_id, uploader_id, file_name, file_original, file_type, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [title.trim(), description.trim(), subject_id, req.user.id,
         relPath, req.file.originalname, fileType, req.file.size]
      );

      res.status(201).json({
        data: { id: result.insertId, title: title.trim(), status: 'PENDING' },
        message: 'Tài liệu đã được tải lên và đang chờ duyệt.',
      });
    } catch (err2) { next(err2); }
  });
});

// ─── DELETE /api/documents/:id ────────────────────────────────────────────────
router.delete('/:id(\\d+)', verifyToken, async (req, res, next) => {
  try {
    const [[doc]] = await db.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
    if (doc.uploader_id !== req.user.id && req.user.role !== 'ADMIN')
      return res.status(403).json({ error: 'Không có quyền xóa tài liệu này.' });

    // Delete physical file
    const filePath = path.join(UPLOAD_DIR, doc.file_name);
    fs.unlink(filePath, () => {});

    await db.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Xóa tài liệu thành công.' });
  } catch (err) { next(err); }
});

// ─── GET /api/documents/:id/download ─────────────────────────────────────────
// Accepts Authorization header OR ?token= query param (needed for browser anchor downloads)
router.get('/:id(\\d+)/download', (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = 'Bearer ' + req.query.token;
  }
  verifyToken(req, res, next);
}, async (req, res, next) => {
  try {
    const [[doc]] = await db.query(
      "SELECT * FROM documents WHERE id = ? AND status = 'APPROVED'",
      [req.params.id]
    );
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });

    const filePath = path.join(UPLOAD_DIR, doc.file_name);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: 'File không tồn tại trên máy chủ.' });

    // Increment download count (fire-and-forget)
    db.query('UPDATE documents SET download_count = download_count + 1 WHERE id = ?', [doc.id]);

    res.download(filePath, doc.file_original);
  } catch (err) { next(err); }
});

module.exports = router;
