require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files: HTML pages, uploads, pdfjs
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,
  message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',      authLimiter, require('./routes/auth'));
app.use('/api/subjects',  require('./routes/subjects'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/quizzes',   require('./routes/quizzes'));
app.use('/api/admin',     require('./routes/admin'));

// Comments are nested under documents
app.use('/api/documents', require('./routes/comments'));

// ─── Root redirect ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/hustudy.html');
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Lỗi máy chủ nội bộ.' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HuStudy server running at http://localhost:${PORT}`);
});
