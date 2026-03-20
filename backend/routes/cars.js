const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

// GET /api/cars  — all active cars (drivers need this for trip start)
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, plate, make, model, year, current_km FROM cars WHERE active = TRUE ORDER BY plate'
  );
  res.json(rows);
});

// POST /api/cars  — admin only
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { plate, make, model, year, current_km = 0 } = req.body;
  if (!plate || !make || !model) {
    return res.status(400).json({ error: 'plate, make and model are required' });
  }
  const { rows } = await db.query(
    `INSERT INTO cars (plate, make, model, year, current_km)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [plate.toUpperCase(), make, model, year || null, current_km]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/cars/:id  — admin only
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { plate, make, model, year, current_km, active } = req.body;
  const { rows } = await db.query(
    `UPDATE cars SET
       plate      = COALESCE($1, plate),
       make       = COALESCE($2, make),
       model      = COALESCE($3, model),
       year       = COALESCE($4, year),
       current_km = COALESCE($5, current_km),
       active     = COALESCE($6, active)
     WHERE id = $7 RETURNING *`,
    [plate, make, model, year, current_km, active, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Car not found' });
  res.json(rows[0]);
});

module.exports = router;
