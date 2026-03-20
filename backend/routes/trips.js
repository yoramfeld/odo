const router = require('express').Router();
const db     = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

async function logError(req, status, message, extra = '') {
  try {
    await db.query(
      `INSERT INTO error_logs (method, path, status_code, message, user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.method, req.path, status, extra ? `${message} — ${extra}` : message, req.user?.id ?? null]
    );
  } catch (_) {}
}

const MAX_TRIP_KM   = parseInt(process.env.OCR_MAX_TRIP_KM)  || 100;
const WARN_TRIP_KM  = parseInt(process.env.OCR_WARN_TRIP_KM) || 50;
const KM_TOLERANCE  = parseInt(process.env.OCR_KM_TOLERANCE)  || 5;
const SPEED_WARN    = parseInt(process.env.SPEED_WARN_KMH)    || 110;
const SPEED_MAX     = parseInt(process.env.SPEED_MAX_KMH)     || 160;
const RETENTION_DAYS = parseInt(process.env.PHOTO_RETENTION_DAYS) || 365;

// ── Helpers ────────────────────────────────────────────────────────────────

function validateEndKm(startKm, startTime, endKm, endTime) {
  const delta = endKm - startKm;

  if (delta < 0)         return { error: 'Odometer went backwards — please retake photo' };
  if (delta === 0)       return { error: 'End KM equals start KM — did you photograph the right display?' };
  if (delta > MAX_TRIP_KM) {
    // Try auto-correction using known prefix
    const prefix    = String(startKm).slice(0, -3);
    const suffix    = String(endKm).slice(-3);
    const corrected = parseInt(prefix + suffix);
    const correctedDelta = corrected - startKm;

    if (correctedDelta > 0 && correctedDelta <= MAX_TRIP_KM) {
      return { corrected, autoCorrection: true };
    }
    return { error: `Trip distance (${delta} km) exceeds maximum — likely OCR misread, please retake` };
  }

  const hours = (new Date(endTime) - new Date(startTime)) / 3_600_000;
  const speed = hours > 0 ? Math.round(delta / hours) : 0;

  if (hours >= 0.25 && speed > SPEED_MAX) {
    // Same prefix-correction attempt
    const prefix    = String(startKm).slice(0, -3);
    const suffix    = String(endKm).slice(-3);
    const corrected = parseInt(prefix + suffix);
    const correctedDelta = corrected - startKm;
    const correctedSpeed = hours > 0 ? Math.round(correctedDelta / hours) : 0;

    if (correctedDelta > 0 && correctedSpeed < SPEED_MAX) {
      return { corrected, autoCorrection: true, speed: correctedSpeed };
    }
    return { error: 'Implausible speed — could not auto-correct OCR reading. Please retake photo.' };
  }

  return {
    ok: true,
    delta,
    speed,
    speedFlag: speed > SPEED_WARN,
    warn: delta > WARN_TRIP_KM ? `Trip is ${delta} km — longer than usual. Please confirm.` : null,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────

// GET /api/trips  — driver: own trips; admin: all trips
router.get('/', requireAuth, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { rows } = await db.query(
    `SELECT t.id, t.car_id, t.driver_id,
            c.plate, c.make, c.model,
            u.name AS driver_name,
            t.start_km_confirmed, t.start_time,
            t.end_km_confirmed, t.end_time,
            t.reason, t.notes, t.status,
            t.discrepancy_flag, t.discrepancy_delta,
            t.speed_flag, t.avg_speed_kmh,
            (t.end_km_confirmed - t.start_km_confirmed) AS distance_km
     FROM trips t
     JOIN cars  c ON c.id = t.car_id
     JOIN users u ON u.id = t.driver_id
     ${isAdmin ? '' : 'WHERE t.driver_id = $1'}
     ORDER BY t.start_time DESC
     LIMIT 200`,
    isAdmin ? [] : [req.user.id]
  );
  res.json(rows);
});

// GET /api/trips/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, c.plate, c.make, c.model, u.name AS driver_name
     FROM trips t
     JOIN cars c ON c.id = t.car_id
     JOIN users u ON u.id = t.driver_id
     WHERE t.id = $1`,
    [req.params.id]
  );
  const trip = rows[0];
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (req.user.role !== 'admin' && trip.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(trip);
});

// GET /api/trips/car/:carId/last-end-km
router.get('/car/:carId/last-end-km', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT end_km_confirmed AS last_km, end_time
     FROM trips
     WHERE car_id = $1 AND status = 'completed' AND end_km_confirmed IS NOT NULL
     ORDER BY end_time DESC
     LIMIT 1`,
    [req.params.carId]
  );
  res.json(rows[0] || { last_km: null });
});

// POST /api/trips/start
router.post('/start', requireAuth, async (req, res) => {
  const { carId, startKm, reason, notes, startLocation } = req.body;
  if (!carId || startKm == null || !reason) {
    return res.status(400).json({ error: 'carId, startKm and reason are required' });
  }

  // Only one active trip per car
  const { rows: active } = await db.query(
    `SELECT id FROM trips WHERE car_id = $1 AND status = 'active' LIMIT 1`,
    [carId]
  );
  if (active.length) {
    return res.status(409).json({ error: 'This car already has an active trip' });
  }

  // Discrepancy check vs last confirmed end KM
  const { rows: last } = await db.query(
    `SELECT end_km_confirmed FROM trips
     WHERE car_id = $1 AND status = 'completed' AND end_km_confirmed IS NOT NULL
     ORDER BY end_time DESC LIMIT 1`,
    [carId]
  );
  const lastKm = last[0]?.end_km_confirmed;
  const delta  = lastKm != null ? Math.abs(startKm - lastKm) : 0;
  const discrepancy = lastKm != null && delta > KM_TOLERANCE;

  const { rows } = await db.query(
    `INSERT INTO trips (car_id, driver_id, start_km_confirmed, start_time, reason, notes,
                        discrepancy_flag, discrepancy_delta, start_location)
     VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8) RETURNING *`,
    [carId, req.user.id, startKm, reason, notes || null,
     discrepancy, discrepancy ? delta : null, startLocation || null]
  );

  res.status(201).json(rows[0]);
});

// PATCH /api/trips/:id/end
router.patch('/:id/end', requireAuth, async (req, res) => {
  const { endKmOcr, endKmConfirmed, endPhotoBase64, endLocation } = req.body;
  if (endKmConfirmed == null) {
    return res.status(400).json({ error: 'endKmConfirmed is required' });
  }

  const { rows: [trip] } = await db.query(
    'SELECT * FROM trips WHERE id = $1', [req.params.id]
  );
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.status !== 'active') return res.status(409).json({ error: 'Trip is not active' });
  if (req.user.role !== 'admin' && trip.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const endTime = new Date();
  const validation = validateEndKm(trip.start_km_confirmed, trip.start_time, endKmConfirmed, endTime);

  if (validation.error) {
    await logError(req, 422, validation.error,
      `driver: ${req.user.name} · trip ${trip.id} · car ${trip.car_id} · start ${trip.start_km_confirmed} → submitted ${endKmConfirmed}`);
    return res.status(422).json({ error: validation.error });
  }

  const finalKm = validation.corrected ?? endKmConfirmed;
  const photoBuffer = endPhotoBase64 ? Buffer.from(endPhotoBase64, 'base64') : null;
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000);

  const { rows } = await db.query(
    `UPDATE trips SET
       end_km_ocr       = $1,
       end_km_confirmed = $2,
       end_photo        = $3,
       end_time         = $4,
       status           = 'completed',
       speed_flag       = $5,
       avg_speed_kmh    = $6,
       photo_expires_at = $7,
       end_location     = $8
     WHERE id = $9 RETURNING *`,
    [endKmOcr || null, finalKm, photoBuffer, endTime,
     validation.speedFlag || false, validation.speed || null,
     photoBuffer ? expiresAt : null, endLocation || null, trip.id]
  );

  // Update car's current_km
  await db.query('UPDATE cars SET current_km = $1 WHERE id = $2', [finalKm, trip.car_id]);

  res.json({
    trip: rows[0],
    autoCorrection: validation.autoCorrection || false,
    warn: validation.warn || null,
  });
});

module.exports = router;
