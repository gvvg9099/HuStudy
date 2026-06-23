const router = require('express').Router();
const db     = require('../db');
const { verifyToken, optionalToken } = require('../middleware/auth');

// GET /api/quizzes  — list quizzes (no answers)
router.get('/', optionalToken, async (req, res, next) => {
  try {
    const { subject, difficulty } = req.query;
    const params = [];
    let where = '1=1';

    if (subject) {
      where += ' AND s.name = ?';
      params.push(subject);
    }
    if (difficulty) {
      where += ' AND q.difficulty = ?';
      params.push(difficulty);
    }

    const [rows] = await db.query(
      `SELECT q.id, q.title, q.difficulty, q.time_minutes, q.attempt_count, q.created_at,
              s.id AS subject_id, s.name AS subject_name, s.color AS subject_color, s.bg AS subject_bg,
              (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
       FROM quizzes q
       JOIN subjects s ON s.id = q.subject_id
       WHERE ${where}
       ORDER BY q.created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/quizzes/:id  — full quiz with questions (no correct answers)
router.get('/:id(\\d+)', verifyToken, async (req, res, next) => {
  try {
    const [[quiz]] = await db.query(
      `SELECT q.id, q.title, q.difficulty, q.time_minutes, q.attempt_count,
              s.name AS subject_name, s.color AS subject_color, s.bg AS subject_bg
       FROM quizzes q
       JOIN subjects s ON s.id = q.subject_id
       WHERE q.id = ?`,
      [req.params.id]
    );
    if (!quiz) return res.status(404).json({ error: 'Không tìm thấy bộ đề.' });

    const [questions] = await db.query(
      'SELECT id, text, options, sort_order FROM questions WHERE quiz_id = ? ORDER BY sort_order',
      [req.params.id]
    );
    // Parse JSON options
    questions.forEach(q => {
      if (typeof q.options === 'string') q.options = JSON.parse(q.options);
    });

    // User's best attempt
    const [[bestAttempt]] = await db.query(
      `SELECT score, total, time_elapsed, created_at
       FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?
       ORDER BY score DESC, created_at DESC LIMIT 1`,
      [req.user.id, req.params.id]
    );

    res.json({ data: { ...quiz, questions, best_attempt: bestAttempt || null } });
  } catch (err) { next(err); }
});

// POST /api/quizzes/:id/submit
router.post('/:id(\\d+)/submit', verifyToken, async (req, res, next) => {
  try {
    const { answers, time_elapsed } = req.body;
    if (!Array.isArray(answers))
      return res.status(400).json({ error: 'Dữ liệu đáp án không hợp lệ.' });

    // Fetch correct answers server-side
    const [questions] = await db.query(
      'SELECT id, answer FROM questions WHERE quiz_id = ? ORDER BY sort_order',
      [req.params.id]
    );
    if (!questions.length) return res.status(404).json({ error: 'Bộ đề không có câu hỏi.' });

    const total  = questions.length;
    let   score  = 0;
    const detail = questions.map((q, i) => {
      const userAns = answers[i] !== undefined ? parseInt(answers[i]) : -1;
      const correct = userAns === q.answer;
      if (correct) score++;
      return { question_id: q.id, correct_option: q.answer, user_answer: userAns, is_correct: correct };
    });

    // Save attempt
    await db.query(
      'INSERT INTO quiz_attempts (user_id, quiz_id, score, total, time_elapsed) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, req.params.id, score, total, time_elapsed || null]
    );

    // Increment attempt count
    await db.query('UPDATE quizzes SET attempt_count = attempt_count + 1 WHERE id = ?', [req.params.id]);

    res.json({
      score,
      total,
      percentage: Math.round((score / total) * 100),
      correct_answers: detail,
    });
  } catch (err) { next(err); }
});

// GET /api/quizzes/:id/attempts  — user's attempt history
router.get('/:id(\\d+)/attempts', verifyToken, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT id, score, total, time_elapsed, created_at
       FROM quiz_attempts
       WHERE user_id = ? AND quiz_id = ?
       ORDER BY created_at DESC LIMIT 20`,
      [req.user.id, req.params.id]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
