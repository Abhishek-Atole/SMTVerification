const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'smtverify',
  user: 'smtverify',
  password: 'smtverify'
});

pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qa_name text;`, (err, res) => {
  if (err) {
    console.error('Error adding qa_name column:', err);
    process.exit(1);
  }
  console.log('✓ Added qa_name column to sessions table');
  pool.end();
});
