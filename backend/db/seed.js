// Seed data — run once after schema is created
// ID numbers below satisfy the Israeli Luhn checksum (used for realism):
//   000000018, 000000026, 000000034

const bcrypt = require('bcrypt');
const db = require('./database');

const COST = 12;

async function seed() {
  console.log('Seeding...');

  // Admin
  const adminHash = await bcrypt.hash('000000018', COST);
  const { rows: [admin] } = await db.query(
    `INSERT INTO users (name, phone, id_number_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (phone) DO NOTHING
     RETURNING id`,
    ['Fleet Manager', '050-0000001', adminHash, 'admin']
  );


  console.log('Seed complete.');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
