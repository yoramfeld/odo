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
  const hours = (new Date(endTime) - new Date(startTime)) / 3_600_000;
  const speed = hours > 0 && delta > 0 ? Math.round(delta / hours) : 0;

  // Try auto-correction (OCR misread leading digits) when delta looks wrong
  function tryCorrect() {
    const prefix = String(startKm).slice(0, -3);
    const suffix = String(endKm).slice(-3);
    const corrected = parseInt(prefix + suffix);
    const cd = corrected - startKm;
    if (cd > 0 && cd <= MAX_TRIP_KM) return corrected;
    return null;
  }

  if (delta < 0) {
    const corrected = tryCorrect();
    if (corrected) return { corrected, autoCorrection: true, delta: corrected - startKm, speed: 0, speedFlag: false };
    return { ok: true, delta, speed: 0, speedFlag: false, anomaly: 'negative_delta' };
  }

  if (delta > MAX_TRIP_KM) {
    const corrected = tryCorrect();
    if (corrected) return { corrected, autoCorrection: true, delta: corrected - startKm, speed: 0, speedFlag: false };
    return { ok: true, delta, speed, speedFlag: false, anomaly: 'large_delta' };
  }

  if (hours >= 0.25 && speed > SPEED_MAX) {
    const corrected = tryCorrect();
    if (corrected) {
      const cs = Math.round((corrected - startKm) / hours);
      return { corrected, autoCorrection: true, delta: corrected - startKm, speed: cs, speedFlag: cs > SPEED_WARN };
    }
    return { ok: true, delta, speed, speedFlag: true, anomaly: 'high_speed' };
  }

  return {
    ok: true, delta, speed,
    speedFlag: speed > SPEED_WARN,
    warn: delta > WARN_TRIP_KM ? `נסיעה של ${delta} ק״מ — ארוכה מהרגיל.` : null,
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
            t.start_location, t.end_location,
            t.approved_by, t.manual_fields,
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

// GET /api/trips/suggestions — preset + recent distinct reason & approved_by for this driver
router.get('/suggestions', requireAuth, async (req, res) => {
  const REASON_PRESETS   = ['מנהלי', 'בט"ש', 'מבצעי', 'איסוף/פיזור', 'תדלוק'];
  const APPROVED_PRESETS = ['ק.אגם', 'אח"מ'];

  const [{ rows: rr }, { rows: ar }, { rows: lr }, { rows: er }] = await Promise.all([
    db.query(`SELECT DISTINCT reason FROM trips WHERE driver_id = $1 AND reason IS NOT NULL ORDER BY reason LIMIT 30`, [req.user.id]),
    db.query(`SELECT DISTINCT approved_by FROM trips WHERE driver_id = $1 AND approved_by IS NOT NULL ORDER BY approved_by LIMIT 30`, [req.user.id]),
    db.query(`SELECT DISTINCT start_location FROM trips WHERE driver_id = $1 AND start_location IS NOT NULL ORDER BY start_location LIMIT 30`, [req.user.id]),
    db.query(`SELECT DISTINCT end_location FROM trips WHERE driver_id = $1 AND end_location IS NOT NULL ORDER BY end_location LIMIT 30`, [req.user.id]),
  ]);

  const recentReasons   = rr.map(r => r.reason).filter(r => !REASON_PRESETS.includes(r));
  const recentApproved  = ar.map(r => r.approved_by).filter(r => !APPROVED_PRESETS.includes(r));

  res.json({
    reason:         [...REASON_PRESETS, ...recentReasons],
    approved_by:    [...APPROVED_PRESETS, ...recentApproved],
    start_location: lr.map(r => r.start_location),
    end_location:   er.map(r => r.end_location),
  });
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
    return res.status(403).json({ error: 'אין הרשאה' });
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

// PATCH /api/trips/:id/start-details — edit start fields of an active trip
router.patch('/:id/start-details', requireAuth, async (req, res) => {
  const { startKm, startTime, startLocation, startLocationManual, reason, approvedBy } = req.body;

  const { rows: [trip] } = await db.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.status !== 'active') return res.status(409).json({ error: 'Trip is not active' });
  if (req.user.role !== 'admin' && trip.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'אין הרשאה' });
  }

  // Build manual_fields: start-details banner always implies these were corrected after the fact
  const prevManual = trip.manual_fields ? trip.manual_fields.split(',') : [];
  prevManual.push('start_km', 'start_time');
  if (startLocationManual) prevManual.push('start_location');
  const manualFields = [...new Set(prevManual)].join(',');

  const { rows } = await db.query(
    `UPDATE trips SET
       start_km_confirmed = COALESCE($1, start_km_confirmed),
       start_time         = COALESCE($2, start_time),
       start_location     = COALESCE($3, start_location),
       reason             = COALESCE($4, reason),
       approved_by        = $5,
       manual_fields      = $6
     WHERE id = $7 RETURNING *`,
    [startKm ?? null, startTime || null, startLocation || null,
     reason || null, approvedBy || null, manualFields, req.params.id]
  );
  res.json(rows[0]);
});

// POST /api/trips/start
router.post('/start', requireAuth, async (req, res) => {
  const { carId, startKm, reason, notes, startLocation, startLocationGps, approvedBy } = req.body;
  const manualFields = startLocation ? 'start_location' : null;
  if (!carId || startKm == null || !reason || !approvedBy) {
    return res.status(400).json({ error: 'carId, startKm, reason and approvedBy are required' });
  }

  // Only one active trip per car
  const { rows: active } = await db.query(
    `SELECT id FROM trips WHERE car_id = $1 AND status = 'active' LIMIT 1`,
    [carId]
  );
  if (active.length) {
    return res.status(409).json({ error: 'לרכב זה יש נסיעה פעילה' });
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
                        discrepancy_flag, discrepancy_delta, start_location, start_location_gps, approved_by, manual_fields)
     VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [carId, req.user.id, startKm, reason, notes || null,
     discrepancy, discrepancy ? delta : null,
     startLocation || null, startLocationGps || null, approvedBy || null, manualFields]
  );

  res.status(201).json(rows[0]);
});

// PATCH /api/trips/:id/end
router.patch('/:id/end', requireAuth, async (req, res) => {
  const { endKmOcr, endKmConfirmed, endPhotoBase64, endLocation, endLocationGps, endKmManual,
          startKm: overrideStartKm, startTime: overrideStartTime, startLocation: overrideStartLocation,
          reason: overrideReason, approvedBy: overrideApprovedBy, notes: overrideNotes } = req.body;
  if (endKmConfirmed == null) {
    return res.status(400).json({ error: 'endKmConfirmed is required' });
  }

  const { rows: [trip] } = await db.query(
    'SELECT * FROM trips WHERE id = $1', [req.params.id]
  );
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.status !== 'active') return res.status(409).json({ error: 'נסיעה זו כבר הסתיימה' });
  if (req.user.role !== 'admin' && trip.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'אין הרשאה' });
  }
  const endTime = new Date();
  const effectiveStartKm   = overrideStartKm   ?? trip.start_km_confirmed;
  const effectiveStartTime = overrideStartTime ? new Date(overrideStartTime) : trip.start_time;
  const validation = validateEndKm(effectiveStartKm, effectiveStartTime, endKmConfirmed, endTime);

  const finalKm = validation.corrected ?? endKmConfirmed;
  const photoBuffer = endPhotoBase64 ? Buffer.from(endPhotoBase64, 'base64') : null;
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000);

  // Build manual_fields
  const prevManual = trip.manual_fields ? trip.manual_fields.split(',') : [];
  if (endKmManual)           prevManual.push('end_km');
  if (overrideStartKm)       prevManual.push('start_km');
  if (overrideStartTime)     prevManual.push('start_time');
  if (overrideStartLocation) prevManual.push('start_location');
  if (validation.anomaly)    prevManual.push(validation.anomaly);
  const manualFields = prevManual.length ? [...new Set(prevManual)].join(',') : null;

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
       end_location          = $8,
       end_location_gps      = $9,
       manual_fields         = $10,
       start_km_confirmed    = COALESCE($11, start_km_confirmed),
       start_time            = COALESCE($12::timestamptz, start_time),
       start_location        = COALESCE($13, start_location),
       reason                = COALESCE($14, reason),
       approved_by           = COALESCE($15, approved_by),
       notes                 = COALESCE($16, notes)
     WHERE id = $17 RETURNING *`,
    [endKmOcr || null, finalKm, photoBuffer, endTime,
     validation.speedFlag || false, validation.speed || null,
     photoBuffer ? expiresAt : null, endLocation || null,
     endLocationGps || null, manualFields,
     overrideStartKm || null, overrideStartTime || null, overrideStartLocation || null,
     overrideReason || null, overrideApprovedBy || null, overrideNotes || null,
     trip.id]
  );

  // Update car's current_km
  await db.query('UPDATE cars SET current_km = $1 WHERE id = $2', [finalKm, trip.car_id]);

  res.json({
    trip: rows[0],
    autoCorrection: validation.autoCorrection || false,
    warn: validation.warn || null,
  });
});

// PATCH /api/trips/:id — admin: edit any field of any trip
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { startKm, startTime, startLocation, endKm, endTime, endLocation,
          reason, approvedBy, notes, status } = req.body;

  const { rows: [trip] } = await db.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const { rows } = await db.query(
    `UPDATE trips SET
       start_km_confirmed = COALESCE($1, start_km_confirmed),
       start_time         = COALESCE($2::timestamptz, start_time),
       start_location     = COALESCE($3, start_location),
       end_km_confirmed   = COALESCE($4, end_km_confirmed),
       end_time           = COALESCE($5::timestamptz, end_time),
       end_location       = COALESCE($6, end_location),
       reason             = COALESCE($7, reason),
       approved_by        = COALESCE($8, approved_by),
       notes              = COALESCE($9, notes),
       status             = COALESCE($10, status)
     WHERE id = $11 RETURNING *`,
    [startKm ?? null, startTime || null, startLocation ?? null,
     endKm ?? null, endTime || null, endLocation ?? null,
     reason || null, approvedBy ?? null, notes ?? null,
     status || null, req.params.id]
  );
  res.json(rows[0]);
});

module.exports = router;
