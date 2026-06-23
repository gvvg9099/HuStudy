const router = require('express').Router();
const db     = require('../db');
const { verifyToken } = require('../middleware/auth');

// GET /api/favorites  — list user's favorited documents
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id, d.title, d.description, d.file_type, d.file_size,
              d.download_count, d.created_at, f.created_at AS favorited_at,
              s.name AS subject_name, s.color AS subject_color, s.bg AS subject_bg,
              u.name AS uploader_name,
              TRUE AS is_favorited
       FROM favorites f
       JOIN documents d ON d.id = f.document_id
       JOIN subjects  s ON s.id = d.subject_id
       JOIN users     u ON u.id = d.uploader_id
       WHERE f.user_id = ? AND d.status = 'APPROVED'
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/favorites/:documentId  — toggle favorite
router.post('/:documentId(\\d+)', verifyToken, async (req, res, next) => {
  try {
    const docId = parseInt(req.params.documentId);
    const userId = req.user.id;

    // Check if already favorited
    const [[existing]] = await db.query(
      'SELECT id FROM favorites WHERE user_id = ? AND document_id = ?',
      [userId, docId]
    );

    if (existing) {
      await db.query('DELETE FROM favorites WHERE user_id = ? AND document_id = ?', [userId, docId]);
      res.json({ favorited: false });
    } else {
      // Verify document exists
      const [[doc]] = await db.query("SELECT id FROM documents WHERE id = ? AND status = 'APPROVED'", [docId]);
      if (!doc) return res.status(404).json({ error: 'Tài liệu không tồn tại.' });

      await db.query('INSERT IGNORE INTO favorites (user_id, document_id) VALUES (?, ?)', [userId, docId]);
      res.json({ favorited: true });
    }
  } catch (err) { next(err); }
});

module.exports = router;
