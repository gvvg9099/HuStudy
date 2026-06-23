const { verifyToken } = require('./auth');

function requireAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user && req.user.role === 'ADMIN') return next();
    res.status(403).json({ error: 'Yêu cầu quyền quản trị viên.' });
  });
}

module.exports = requireAdmin;
