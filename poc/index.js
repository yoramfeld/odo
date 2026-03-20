// Vercel serverless entry point — delegates everything to the Express app
require('dotenv').config();
module.exports = require('../backend/server');
