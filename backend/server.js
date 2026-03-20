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

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

startCleanupJob();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Fleet Logger backend running on :${PORT}`));
