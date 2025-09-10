const { Client } = require('pg');

async function createDatabase() {
  // First connect to postgres default database to create minibet database
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '9530',
    database: 'postgres' // Connect to default postgres database first
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');
    
    // Check if database exists
    const checkDb = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'minibet'"
    );
    
    if (checkDb.rows.length === 0) {
      // Create the database
      await client.query('CREATE DATABASE minibet');
      console.log('Database "minibet" created successfully!');
    } else {
      console.log('Database "minibet" already exists');
    }
    
  } catch (error) {
    console.error('Error creating database:', error.message);
  } finally {
    await client.end();
  }
}

createDatabase();
