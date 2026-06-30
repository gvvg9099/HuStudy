const router = require('express').Router();
const db     = require('../db');

// GET /api/subjects — lấy danh sách môn học
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT s.id, s.name, s.slug, s.icon, s.color, s.bg,
             COUNT(CASE WHEN d.status = 'APPROVED' THEN 1 END) AS doc_count
      FROM subjects s
      LEFT JOIN documents d ON d.subject_id = s.id
      GROUP BY s.id
      ORDER BY s.name
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
