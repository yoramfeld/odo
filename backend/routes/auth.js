const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const MAX_ATTEMPTS    = parseInt(process.env.LOGIN_MAX_ATTEMPTS)   || 5;
const LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES) || 15;
const JWT_EXPIRY_DAYS = parseInt(process.env.JWT_EXPIRY_DAYS)       || 90;

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const rawPhone = req.body.phone;
    const { idNumber } = req.body;
    if (!rawPhone || !idNumber) {
      return res.status(400).json({ error: 'Phone and ID number required' });
    }
    const phone = rawPhone.replace(/[\s-]/g, '');

    // Rate limit check
    const window = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);
    const { rows: attempts } = await db.query(
      `SELECT COUNT(*) AS cnt FROM login_attempts
       WHERE phone = $1 AND attempted_at > $2 AND success = FALSE`,
      [phone, window]
    );
    if (parseInt(attempts[0].cnt) >= MAX_ATTEMPTS) {
      return res.status(429).json({
        error: `Too many attempts — try again in ${LOCKOUT_MINUTES} minutes`,
      });
    }

    // Look up user
    const { rows } = await db.query(
      'SELECT id, name, phone, id_number_hash, role, active FROM users WHERE phone = $1',
      [phone]
    );
    const user = rows[0];

    const valid = user && await bcrypt.compare(idNumber, user.id_number_hash);

    // Log attempt (never log the idNumber itself)
    await db.query(
      'INSERT INTO login_attempts (phone, success) VALUES ($1, $2)',
      [phone, valid]
    );

    if (!valid) {
      return res.status(401).json({ error: 'Invalid phone or ID number' });
    }
    if (!user.active) {
      return res.status(401).json({ error: 'Access revoked — contact your fleet manager' });
    }

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: `${JWT_EXPIRY_DAYS}d` }
    );

    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/logout  (client clears token; nothing to do server-side)
router.post('/logout', (req, res) => res.json({ ok: true }));

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const { id, name, phone, role } = req.user;
  res.json({ id, name, phone, role });
});

module.exports = router;
