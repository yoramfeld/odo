require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { startCleanupJob } = require('./services/cleanup');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/ocr',     require('./routes/ocr'));
app.use('/api/cars',    require('./routes/cars'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/trips',   require('./routes/trips'));
app.use('/api/export',  require('./routes/export'));
app.use('/api/errors',    require('./routes/errors'));
app.use('/api/locations', require('./routes/locations'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Global error handler — log to DB + console
app.use(async (err, req, res, _next) => {
  console.error(err);
  try {
    const db = require('./db/database');
    await db.query(
      `INSERT INTO error_logs (method, path, status_code, message, stack, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.method, req.path, 500, err.message, err.stack, req.user?.id ?? null]
    );
  } catch (_) { /* don't let logging failure mask the original error */ }
  res.status(500).json({ error: 'Internal server error' });
});

// Local dev only — cron + listen don't apply in Vercel serverless
if (require.main === module) {
  startCleanupJob();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Fleet Logger backend running on :${PORT}`));
}

module.exports = app;
