const router = require('express').Router();
const db     = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

// GET /api/errors — last 200 errors, admin only
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.id, e.created_at, e.method, e.path, e.status_code,
            e.message, e.stack, u.name AS user_name
     FROM error_logs e
     LEFT JOIN users u ON u.id = e.user_id
     ORDER BY e.created_at DESC
     LIMIT 200`
  );
  res.json(rows);
});

// DELETE /api/errors — clear all logs, admin only
router.delete('/', requireAuth, requireAdmin, async (req, res) => {
  await db.query('DELETE FROM error_logs');
  res.json({ ok: true });
});

module.exports = router;
