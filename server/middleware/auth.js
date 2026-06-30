const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'hustudy_secret';

function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Không có token xác thực.' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
}

function optionalToken(req, res, next) {
  const header = req.headers['authorization'];
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), SECRET);
    } catch {
      // Token không hợp lệ — coi như chưa đăng nhập
    }
  }
  next();
}

module.exports = { verifyToken, optionalToken };
