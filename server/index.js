require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const app = express();

// ─── Middleware (xử lý trung gian) ─────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ file tĩnh: các trang HTML, file upload, thư viện pdfjs
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Giới hạn số lượng request cho các endpoint xác thực (auth)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 phút
  max: 20,
  message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Các route (đường dẫn API) ───────────────────────────────────────────
app.use('/api/auth',      authLimiter, require('./routes/auth'));
app.use('/api/subjects',  require('./routes/subjects'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/quizzes',   require('./routes/quizzes'));
app.use('/api/admin',     require('./routes/admin'));

// Bình luận (comments) được lồng bên trong tài liệu (documents)
app.use('/api/documents', require('./routes/comments'));

// ─── Chuyển hướng trang gốc ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/hustudy.html');
});

// ─── Kiểm tra tình trạng server (health check) ─────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─── Bộ xử lý lỗi toàn cục ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Lỗi máy chủ nội bộ.' });
});

// ─── Khởi động server ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HuStudy server running at http://localhost:${PORT}`);
});
