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

  const adminId = admin?.id;

  // Drivers
  const d1Hash = await bcrypt.hash('000000026', COST);
  const d2Hash = await bcrypt.hash('000000034', COST);

  await db.query(
    `INSERT INTO users (name, phone, id_number_hash, role, added_by)
     VALUES ($1,$2,$3,'driver',$4), ($5,$6,$7,'driver',$4)
     ON CONFLICT (phone) DO NOTHING`,
    ['Avi Cohen', '050-0000002', d1Hash, adminId,
     'Dana Levi',  '050-0000003', d2Hash]
  );

  // Cars
  await db.query(
    `INSERT INTO cars (plate, make, model, year, current_km)
     VALUES
       ('12-345-67', 'Toyota',  'Corolla', 2021, 42300),
       ('23-456-78', 'Hyundai', 'i20',     2020, 67800),
       ('34-567-89', 'Kia',     'Sportage',2022, 31500)
     ON CONFLICT (plate) DO NOTHING`
  );

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
