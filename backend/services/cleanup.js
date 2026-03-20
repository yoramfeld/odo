// Daily cron: null out end_photo for trips older than PHOTO_RETENTION_DAYS
const cron = require('node-cron');
const db   = require('../db/database');

function startCleanupJob() {
  // Runs daily at 02:00
  cron.schedule('0 2 * * *', async () => {
    try {
      const { rowCount } = await db.query(
        `UPDATE trips
         SET end_photo = NULL
         WHERE end_photo IS NOT NULL
           AND photo_expires_at < NOW()`
      );
      if (rowCount > 0) {
        console.log(`[cleanup] Nulled photos for ${rowCount} expired trip(s)`);
      }
    } catch (err) {
      console.error('[cleanup] Error:', err.message);
    }
  });

  console.log('[cleanup] Photo cleanup cron scheduled (daily 02:00)');
}

module.exports = { startCleanupJob };
