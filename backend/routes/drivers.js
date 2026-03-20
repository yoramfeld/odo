const router = require('express').Router();
const bcrypt = require('bcrypt');
const db     = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

const COST = 12;

// GET /api/drivers  — admin only
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.phone, u.role, u.active, u.added_at, u.last_login_at,
            COUNT(t.id)::int AS total_trips
     FROM users u
     LEFT JOIN trips t ON t.driver_id = u.id
     WHERE u.role IN ('driver', 'admin')
     GROUP BY u.id
     ORDER BY u.name`
  );
  res.json(rows);
});

// POST /api/drivers  — admin only; hashes ID on arrival, never stored raw
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, phone, idNumber, role = 'driver' } = req.body;
  if (!name || !phone || !idNumber) {
    return res.status(400).json({ error: 'name, phone and idNumber are required' });
  }
  if (!['driver', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role must be driver or admin' });
  }

  const hash = await bcrypt.hash(idNumber, COST);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (name, phone, id_number_hash, role, added_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, phone, role, active, added_at`,
      [name, phone, hash, role, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Phone number already registered' });
    throw err;
  }
});

// PATCH /api/drivers/:id/active  — activate or deactivate
router.patch('/:id/active', requireAuth, requireAdmin, async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be boolean' });
  }
  const { rows } = await db.query(
    'UPDATE users SET active = $1 WHERE id = $2 RETURNING id, name, active',
    [active, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

module.exports = router;
