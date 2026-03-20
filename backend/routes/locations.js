const router = require('express').Router();
const db     = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const LEARN_THRESHOLD = 2;   // auto-apply after this many corrections
const RADIUS_M        = 100; // metres

function haversine(lat1, lng1, lat2, lng2) {
  const R  = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function findNearby(lat, lng) {
  const d = 0.002; // bounding box ~200m each side
  const { rows } = await db.query(
    `SELECT id, lat, lng, name, use_count FROM location_corrections
     WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4`,
    [lat - d, lat + d, lng - d, lng + d]
  );
  return rows
    .map(r => ({ ...r, dist: haversine(lat, lng, r.lat, r.lng) }))
    .filter(r => r.dist <= RADIUS_M)
    .sort((a, b) => a.dist - b.dist);
}

// GET /api/locations/lookup?lat=&lng=
// Returns learned name if ≥ LEARN_THRESHOLD corrections exist within 100m
router.get('/lookup', requireAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.json({ name: null });
  const nearby = await findNearby(lat, lng);
  const match  = nearby.find(r => r.use_count >= LEARN_THRESHOLD);
  res.json({ name: match?.name || null });
});

// POST /api/locations/correct  { lat, lng, name }
// Saves or increments a correction; updates name to latest value
router.post('/correct', requireAuth, async (req, res) => {
  const { lat, lng, name } = req.body;
  if (!lat || !lng || !name?.trim()) return res.status(400).json({ error: 'lat, lng, name required' });
  const nearby = await findNearby(lat, lng);
  if (nearby.length) {
    await db.query(
      `UPDATE location_corrections SET name = $1, use_count = use_count + 1, updated_at = NOW()
       WHERE id = $2`,
      [name.trim(), nearby[0].id]
    );
  } else {
    await db.query(
      `INSERT INTO location_corrections (lat, lng, name) VALUES ($1, $2, $3)`,
      [lat, lng, name.trim()]
    );
  }
  res.json({ ok: true });
});

module.exports = router;
