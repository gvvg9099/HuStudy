const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { verifyToken } = require('../middleware/auth');

const SECRET  = process.env.JWT_SECRET  || 'hustudy_secret';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: EXPIRES });
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || name.trim().length < 2)
      return res.status(400).json({ error: 'Tên phải có ít nhất 2 ký tự.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Email không hợp lệ.' });
    if (!password || password.length < 8)
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự.' });

    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (rows.length) return res.status(409).json({ error: 'Email đã được sử dụng.' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), email.toLowerCase(), hash]
    );

    const user = { id: result.insertId, name: name.trim(), email: email.toLowerCase(), role: 'STUDENT' };
    res.status(201).json({ token: signToken(user), user });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu.' });

    const [rows] = await db.query(
      'SELECT id, name, email, password_hash, role, banned FROM users WHERE email = ?',
      [email.toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });

    const user = rows[0];
    if (user.banned) return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });

    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ token: signToken(payload), user: payload });
  } catch (err) { next(err); }
});

// POST /api/auth/logout  (stateless — client just discards token)
router.post('/logout', verifyToken, (req, res) => {
  res.json({ message: 'Đăng xuất thành công.' });
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, avatar, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Người dùng không tồn tại.' });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
