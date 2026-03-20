const jwt  = require('jsonwebtoken');
const db   = require('../db/database');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Always check active flag — deactivation must be instant
  const { rows } = await db.query(
    'SELECT id, name, phone, role, active FROM users WHERE id = $1',
    [payload.userId]
  );
  const user = rows[0];
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Access revoked — contact your fleet manager' });
  }

  req.user = user;
  next();
}

module.exports = { requireAuth };
