const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { readOdometer } = require('../services/ocr');

// POST /api/ocr/odometer
// Body: { image: base64, mimeType?, contextKm? }
router.post('/odometer', requireAuth, async (req, res) => {
  const { image, mimeType = 'image/jpeg', contextKm } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    const result = await readOdometer(image, mimeType, contextKm || null);
    res.json(result);
  } catch (err) {
    console.error('OCR error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
