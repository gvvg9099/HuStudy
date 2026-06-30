const router   = require('express').Router();
const path     = require('path');
const fs       = require('fs');
const db       = require('../db');
const { verifyToken, optionalToken } = require('../middleware/auth');
const { upload, validateMime }       = require('../middleware/upload');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

// ─── GET /api/documents — lấy danh sách tài liệu ───────────────────────
router.get('/', optionalToken, async (req, res, next) => {
  try {
    const { q = '', subject = '', type = '', sort = 'newest', page = 1, limit = 12 } = req.query;
    const offset  = (parseInt(page) - 1) * parseInt(limit);
    const params  = [];
    let   where   = "d.status = 'APPROVED'";

    // Lọc theo môn học
    if (subject) {
      where += ' AND s.name = ?';
      params.push(subject);
    }

    // Lọc theo loại file
    if (type && ['PDF','DOCX','PPTX'].includes(type.toUpperCase())) {
      where += ' AND d.file_type = ?';
      params.push(type.toUpperCase());
    }

    // Tìm kiếm toàn văn hoặc theo kiểu LIKE
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

    // Truy vấn đếm số lượng kết quả
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM documents d
       JOIN subjects s ON s.id = d.subject_id WHERE ${where}`,
      params
    );

    // Truy vấn lấy dữ liệu
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

    // Đánh dấu is_favorited cho người dùng đã đăng nhập
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

// ─── GET /api/documents/:id — lấy chi tiết một tài liệu ────────────────
router.get('/:id(\\d+)', optionalToken, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id, d.title, d.description, d.file_type, d.file_size, d.file_name,
              d.download_count, d.status, d.quiz_status, d.created_at,
              s.name AS subject_name, s.color AS subject_color, s.bg AS subject_bg,
              u.name AS uploader_name
       FROM documents d
       JOIN subjects s ON s.id = d.subject_id
       JOIN users    u ON u.id = d.uploader_id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });

    const doc = rows[0];
    // Tài liệu chưa được duyệt chỉ chủ sở hữu hoặc admin mới xem được
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

// ─── POST /api/documents — tải lên tài liệu ─────────────────────────────
router.post('/', verifyToken, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Vui lòng chọn file.' });

  const filePath = req.file.path;
  const relPath  = path.relative(UPLOAD_DIR, filePath).replace(/\\/g, '/');

  // Kiểm tra MIME bất đồng bộ
  validateMime(filePath, [], async (err) => {
    if (err) return res.status(422).json({ error: err.message });

    try {
      const { title, subject_id, description = '' } = req.body;
      if (!title || title.trim().length < 3)
        return res.status(400).json({ error: 'Tiêu đề phải có ít nhất 3 ký tự.' });
      if (!subject_id)
        return res.status(400).json({ error: 'Vui lòng chọn môn học.' });

      // Kiểm tra môn học có tồn tại không
      const [[subj]] = await db.query('SELECT id, name FROM subjects WHERE id = ?', [subject_id]);
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

      // Fire-and-forget: sinh quiz bằng AI sau khi upload (không chờ)
      if (process.env.GEMINI_API_KEY) {
        const { generateQuizForDocument } = require('../services/quizGenerator');
        generateQuizForDocument(
          result.insertId, title.trim(), description.trim(),
          subj.name, subj.id, filePath, fileType
        ).catch(() => {});
      }
    } catch (err2) { next(err2); }
  });
});

// ─── DELETE /api/documents/:id — xoá tài liệu ───────────────────────────
router.delete('/:id(\\d+)', verifyToken, async (req, res, next) => {
  try {
    const [[doc]] = await db.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
    if (doc.uploader_id !== req.user.id && req.user.role !== 'ADMIN')
      return res.status(403).json({ error: 'Không có quyền xóa tài liệu này.' });

    // Xoá file vật lý trên ổ đĩa
    const filePath = path.join(UPLOAD_DIR, doc.file_name);
    fs.unlink(filePath, () => {});

    await db.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Xóa tài liệu thành công.' });
  } catch (err) { next(err); }
});

// ─── GET /api/documents/:id/download — tải xuống tài liệu ──────────────
// Chấp nhận header Authorization HOẶC tham số ?token= trên URL (cần thiết khi tải bằng thẻ <a> trên trình duyệt)
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

    // Tăng số lượt tải (không cần chờ kết quả)
    db.query('UPDATE documents SET download_count = download_count + 1 WHERE id = ?', [doc.id]);

    res.download(filePath, doc.file_original);
  } catch (err) { next(err); }
});

module.exports = router;
