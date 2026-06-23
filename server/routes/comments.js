const router = require('express').Router();
const db     = require('../db');
const { verifyToken } = require('../middleware/auth');

// GET /api/documents/:docId/comments
router.get('/:docId(\\d+)/comments', async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM comments WHERE document_id = ?',
      [req.params.docId]
    );

    const [rows] = await db.query(
      `SELECT c.id, c.content, c.likes, c.created_at,
              u.id AS user_id, u.name AS user_name, u.avatar AS user_avatar
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.document_id = ?
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.params.docId, limit, offset]
    );

    res.json({ data: rows, meta: { total, page, limit } });
  } catch (err) { next(err); }
});

// POST /api/documents/:docId/comments
router.post('/:docId(\\d+)/comments', verifyToken, async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length === 0)
      return res.status(400).json({ error: 'Nội dung bình luận không được để trống.' });
    if (content.trim().length > 2000)
      return res.status(400).json({ error: 'Bình luận không được vượt quá 2000 ký tự.' });

    // Verify document exists and is approved
    const [[doc]] = await db.query(
      "SELECT id FROM documents WHERE id = ? AND status = 'APPROVED'",
      [req.params.docId]
    );
    if (!doc) return res.status(404).json({ error: 'Tài liệu không tồn tại.' });

    const [result] = await db.query(
      'INSERT INTO comments (document_id, user_id, content) VALUES (?, ?, ?)',
      [req.params.docId, req.user.id, content.trim()]
    );

    const [[comment]] = await db.query(
      `SELECT c.id, c.content, c.likes, c.created_at,
              u.id AS user_id, u.name AS user_name, u.avatar AS user_avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ data: comment });
  } catch (err) { next(err); }
});

// DELETE /api/documents/:docId/comments/:commentId
router.delete('/:docId(\\d+)/comments/:commentId(\\d+)', verifyToken, async (req, res, next) => {
  try {
    const [[comment]] = await db.query('SELECT * FROM comments WHERE id = ?', [req.params.commentId]);
    if (!comment) return res.status(404).json({ error: 'Bình luận không tồn tại.' });
    if (comment.user_id !== req.user.id && req.user.role !== 'ADMIN')
      return res.status(403).json({ error: 'Không có quyền xóa bình luận này.' });

    await db.query('DELETE FROM comments WHERE id = ?', [req.params.commentId]);
    res.json({ message: 'Xóa bình luận thành công.' });
  } catch (err) { next(err); }
});

// POST /api/documents/:docId/comments/:commentId/like
router.post('/:docId(\\d+)/comments/:commentId(\\d+)/like', verifyToken, async (req, res, next) => {
  try {
    await db.query('UPDATE comments SET likes = likes + 1 WHERE id = ?', [req.params.commentId]);
    const [[c]] = await db.query('SELECT likes FROM comments WHERE id = ?', [req.params.commentId]);
    res.json({ likes: c ? c.likes : 0 });
  } catch (err) { next(err); }
});

module.exports = router;
