// Run schema + seed: node db/init.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs  = require('fs');
const path = require('path');
const db  = require('./database');

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Running schema...');
  await db.query(schema);
  console.log('Schema applied.');
  require('./seed');
}

init().catch(err => { console.error(err); process.exit(1); });
