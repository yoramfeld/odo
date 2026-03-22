const router = require('express').Router();
const XLSX   = require('xlsx');
const db     = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

// GET /api/export/trips?from=&to=&carId=&driverId=
router.get('/trips', requireAuth, requireAdmin, async (req, res) => {
  const { from, to, carId, driverId } = req.query;

  const conditions = [];
  const params     = [];

  if (from)     { params.push(from);     conditions.push(`t.start_time >= $${params.length}`); }
  if (to)       { params.push(to);       conditions.push(`t.start_time <= $${params.length}`); }
  if (carId)    { params.push(carId);    conditions.push(`t.car_id = $${params.length}`); }
  if (driverId) { params.push(driverId); conditions.push(`t.driver_id = $${params.length}`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const { rows } = await db.query(
    `SELECT
       t.id                                                        AS "Trip ID",
       c.plate                                                     AS "Car Plate",
       c.make || ' ' || c.model                                   AS "Make/Model",
       u.name                                                      AS "Driver Name",
       TO_CHAR(t.start_time AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI') AS "Start Time",
       TO_CHAR(t.end_time   AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI') AS "End Time",
       t.start_km_confirmed                                        AS "Start KM",
       t.end_km_confirmed                                          AS "End KM",
       (t.end_km_confirmed - t.start_km_confirmed)                AS "Distance (km)",
       CASE WHEN t.end_time IS NOT NULL THEN
         LPAD(EXTRACT(HOUR   FROM (t.end_time - t.start_time))::int::text, 1, '0') || ':' ||
         LPAD(EXTRACT(MINUTE FROM (t.end_time - t.start_time))::int::text, 2, '0')
       END                                                         AS "Duration (hh:mm)",
       t.start_location                                            AS "Start Location",
       t.start_location_gps                                        AS "Start GPS",
       t.end_location                                              AS "End Location",
       t.end_location_gps                                          AS "End GPS",
       t.reason                                                    AS "Reason",
       t.approved_by                                               AS "Approved By",
       t.notes                                                     AS "Notes",
       CASE WHEN t.discrepancy_flag THEN 'Yes' ELSE '' END        AS "Discrepancy Flag",
       t.discrepancy_delta                                         AS "Discrepancy Delta",
       CASE WHEN t.speed_flag THEN 'Yes' ELSE '' END              AS "Speed Flag",
       t.avg_speed_kmh                                             AS "Avg Speed (km/h)",
       CASE
         WHEN t.manual_fields IS NULL OR t.manual_fields = '' THEN ''
         ELSE (
           SELECT STRING_AGG(label, ', ' ORDER BY label)
           FROM (VALUES
             ('start_km',   'Start KM'),
             ('start_time', 'Start Time'),
             ('end_km',     'End KM'),
             ('end_time',   'End Time')
           ) AS m(field, label)
           WHERE ',' || t.manual_fields || ',' LIKE '%,' || m.field || ',%'
         )
       END                                                         AS "Manual Entries"
     FROM trips t
     JOIN cars  c ON c.id = t.car_id
     JOIN users u ON u.id = t.driver_id
     ${where}
     ORDER BY t.start_time DESC`,
    params
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Trips');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = `fleet-trips-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

module.exports = router;
