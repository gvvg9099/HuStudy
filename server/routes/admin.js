const router       = require('express').Router();
const path         = require('path');
const fs           = require('fs');
const db           = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const { scrapeSubjectQuizUrls, scrapeQuizPage } = require('../scraper');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

// Áp dụng kiểm tra quyền admin cho mọi route trong file này
router.use(requireAdmin);

// ─── GET /api/admin/stats — lấy số liệu thống kê tổng quan ─────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [[users]]    = await db.query('SELECT COUNT(*) AS n FROM users WHERE role = "STUDENT"');
    const [[pending]]  = await db.query('SELECT COUNT(*) AS n FROM documents WHERE status = "PENDING"');
    const [[approved]] = await db.query('SELECT COUNT(*) AS n FROM documents WHERE status = "APPROVED"');
    const [[rejected]] = await db.query('SELECT COUNT(*) AS n FROM documents WHERE status = "REJECTED"');
    const [[dlTotal]]  = await db.query('SELECT COALESCE(SUM(download_count),0) AS n FROM documents');
    const [[quizzes]]  = await db.query('SELECT COUNT(*) AS n FROM quizzes');
    const [[attempts]] = await db.query('SELECT COUNT(*) AS n FROM quiz_attempts');

    res.json({
      total_students:  users.n,
      pending_docs:    pending.n,
      approved_docs:   approved.n,
      rejected_docs:   rejected.n,
      total_downloads: dlTotal.n,
      total_quizzes:   quizzes.n,
      total_attempts:  attempts.n,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/documents — danh sách tài liệu (quản trị) ──────────
router.get('/documents', async (req, res, next) => {
  try {
    const status = ['PENDING','APPROVED','REJECTED'].includes(req.query.status)
      ? req.query.status : null;
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;
    const params = [];
    let   where  = '1=1';

    if (status) { where += ' AND d.status = ?'; params.push(status); }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM documents d WHERE ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT d.id, d.title, d.file_type, d.file_size, d.download_count, d.status, d.created_at,
              s.name AS subject_name,
              u.name AS uploader_name, u.email AS uploader_email
       FROM documents d
       JOIN subjects s ON s.id = d.subject_id
       JOIN users    u ON u.id = d.uploader_id
       WHERE ${where}
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/documents/:id/approve — duyệt tài liệu ───────────
router.patch('/documents/:id(\\d+)/approve', async (req, res, next) => {
  try {
    const [result] = await db.query(
      "UPDATE documents SET status = 'APPROVED' WHERE id = ?", [req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
    res.json({ data: { id: parseInt(req.params.id), status: 'APPROVED' } });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/documents/:id/reject — từ chối tài liệu ──────────
router.patch('/documents/:id(\\d+)/reject', async (req, res, next) => {
  try {
    const [result] = await db.query(
      "UPDATE documents SET status = 'REJECTED' WHERE id = ?", [req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
    res.json({ data: { id: parseInt(req.params.id), status: 'REJECTED' } });
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/documents/:id — xoá tài liệu (quản trị) ─────────
router.delete('/documents/:id(\\d+)', async (req, res, next) => {
  try {
    const [[doc]] = await db.query('SELECT file_name FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });

    fs.unlink(path.join(UPLOAD_DIR, doc.file_name), () => {});
    await db.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa tài liệu.' });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/users — danh sách người dùng ────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM users WHERE role = 'STUDENT'");

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.banned, u.created_at,
              COUNT(d.id) AS doc_count
       FROM users u
       LEFT JOIN documents d ON d.uploader_id = u.id
       WHERE u.role = 'STUDENT'
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({ data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/users/:id/ban — cấm người dùng ────────────────────
router.patch('/users/:id(\\d+)/ban', async (req, res, next) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Không thể tự khóa tài khoản của mình.' });
    await db.query('UPDATE users SET banned = 1 WHERE id = ?', [req.params.id]);
    res.json({ data: { id: parseInt(req.params.id), banned: true } });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/users/:id/unban — bỏ cấm người dùng ──────────────
router.patch('/users/:id(\\d+)/unban', async (req, res, next) => {
  try {
    await db.query('UPDATE users SET banned = 0 WHERE id = ?', [req.params.id]);
    res.json({ data: { id: parseInt(req.params.id), banned: false } });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/users/:id/promote — nâng quyền người dùng ────────
router.patch('/users/:id(\\d+)/promote', async (req, res, next) => {
  try {
    await db.query("UPDATE users SET role = 'ADMIN' WHERE id = ?", [req.params.id]);
    res.json({ data: { id: parseInt(req.params.id), role: 'ADMIN' } });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/quizzes — danh sách quiz (quản trị) ─────────────────
router.get('/quizzes', async (req, res, next) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM quizzes');

    const [rows] = await db.query(
      `SELECT q.id, q.title, q.difficulty, q.time_minutes, q.attempt_count, q.created_at,
              s.name AS subject_name,
              (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
       FROM quizzes q
       JOIN subjects s ON s.id = q.subject_id
       ORDER BY q.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({ data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/quizzes — tạo quiz mới ──────────────────────────────
router.post('/quizzes', async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { title, subject_id, difficulty, time_minutes, questions } = req.body;
    if (!title || !subject_id || !Array.isArray(questions) || questions.length === 0)
      return res.status(400).json({ error: 'Thiếu thông tin bộ đề hoặc câu hỏi.' });

    await conn.beginTransaction();

    const [q] = await conn.query(
      'INSERT INTO quizzes (title, subject_id, difficulty, time_minutes) VALUES (?, ?, ?, ?)',
      [title, subject_id, difficulty || 'Trung bình', time_minutes || 10]
    );
    const quizId = q.insertId;

    for (let i = 0; i < questions.length; i++) {
      const { text, options, answer } = questions[i];
      await conn.query(
        'INSERT INTO questions (quiz_id, text, options, answer, sort_order) VALUES (?, ?, ?, ?, ?)',
        [quizId, text, JSON.stringify(options), answer, i + 1]
      );
    }

    await conn.commit();
    res.status(201).json({ data: { id: quizId, title } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// ─── PUT /api/admin/quizzes/:id — cập nhật quiz ──────────────────────────
router.put('/quizzes/:id(\\d+)', async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { title, subject_id, difficulty, time_minutes, questions } = req.body;

    await conn.beginTransaction();
    await conn.query(
      'UPDATE quizzes SET title=?, subject_id=?, difficulty=?, time_minutes=? WHERE id=?',
      [title, subject_id, difficulty, time_minutes, req.params.id]
    );
    await conn.query('DELETE FROM questions WHERE quiz_id = ?', [req.params.id]);

    for (let i = 0; i < (questions || []).length; i++) {
      const { text, options, answer } = questions[i];
      await conn.query(
        'INSERT INTO questions (quiz_id, text, options, answer, sort_order) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, text, JSON.stringify(options), answer, i + 1]
      );
    }

    await conn.commit();
    res.json({ data: { id: parseInt(req.params.id), title } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// ─── POST /api/admin/import-cauhoi — nhập quiz từ cauhoi.org ────────────
router.post('/import-cauhoi', async (req, res, next) => {
  const { subject_slug, subject_id, difficulty, time_minutes, max_sets } = req.body;
  if (!subject_slug || !subject_id)
    return res.status(400).json({ error: 'Thiếu subject_slug hoặc subject_id.' });

  const diff      = difficulty   || 'Trung bình';
  const timeMins  = parseInt(time_minutes) || 45;
  const maxSets   = parseInt(max_sets)     || 50;

  let imported = 0;
  const errors = [];

  try {
    const urls = await scrapeSubjectQuizUrls(subject_slug);
    if (urls.length === 0)
      return res.status(404).json({ error: `Không tìm thấy đề thi nào cho môn "${subject_slug}". Kiểm tra lại slug.` });

    const targets = urls.slice(0, maxSets);

    for (const url of targets) {
      // Tạm dừng giữa các request để tránh gây quá tải cho trang nguồn
      if (imported > 0) await new Promise(r => setTimeout(r, 600));

      try {
        const { title, questions } = await scrapeQuizPage(url);

        if (!questions.length) {
          errors.push({ url, reason: 'Không parse được câu hỏi nào' });
          continue;
        }

        // Thêm quiz và các câu hỏi trong cùng một transaction
        const conn = await db.getConnection();
        try {
          await conn.beginTransaction();
          const [q] = await conn.query(
            'INSERT INTO quizzes (title, subject_id, difficulty, time_minutes) VALUES (?, ?, ?, ?)',
            [title || `${subject_slug} — Đề nhập tự động`, subject_id, diff, timeMins]
          );
          const quizId = q.insertId;

          for (let i = 0; i < questions.length; i++) {
            const { text, options, answer } = questions[i];
            await conn.query(
              'INSERT INTO questions (quiz_id, text, options, answer, sort_order) VALUES (?, ?, ?, ?, ?)',
              [quizId, text, JSON.stringify(options), answer, i + 1]
            );
          }

          await conn.commit();
          imported++;
        } catch (dbErr) {
          await conn.rollback();
          errors.push({ url, reason: dbErr.message });
        } finally {
          conn.release();
        }
      } catch (scrapeErr) {
        errors.push({ url, reason: scrapeErr.message });
      }
    }

    res.json({ imported, failed: errors.length, total_found: urls.length, errors });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/admin/quizzes/:id — xoá quiz ────────────────────────────
router.delete('/quizzes/:id(\\d+)', async (req, res, next) => {
  try {
    await db.query('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa bộ đề trắc nghiệm.' });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/subjects — danh sách môn học (quản trị) ─────────────
router.get('/subjects', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM subjects ORDER BY name');
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/subjects — tạo môn học mới ──────────────────────────
router.post('/subjects', async (req, res, next) => {
  try {
    const { name, slug, icon, color, bg } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Tên và slug là bắt buộc.' });
    const [result] = await db.query(
      'INSERT INTO subjects (name, slug, icon, color, bg) VALUES (?, ?, ?, ?, ?)',
      [name, slug, icon || '', color || '#6B7280', bg || '#F9FAFB']
    );
    res.status(201).json({ data: { id: result.insertId, name, slug } });
  } catch (err) { next(err); }
});

module.exports = router;
