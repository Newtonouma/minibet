const { Client } = require('pg');
require('dotenv').config();

async function checkAndCreateTables() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Check if tables exist
    const checkTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'transactions', 'bets')
      ORDER BY table_name;
    `;
    
    const result = await client.query(checkTablesQuery);
    console.log('Existing tables:', result.rows);

    if (result.rows.length === 0) {
      console.log('No tables found. Creating tables...');
      
      // Create users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR UNIQUE NOT NULL,
          username VARCHAR NOT NULL,
          password VARCHAR NOT NULL,
          msisdn VARCHAR,
          balance DECIMAL(10,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Created users table');

      // Create transaction status and type enums
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE transactions_type_enum AS ENUM ('deposit', 'withdrawal', 'bet', 'winning');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE transactions_status_enum AS ENUM ('pending', 'completed', 'failed', 'processing');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // Create transactions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          "transactionId" VARCHAR UNIQUE NOT NULL,
          type transactions_type_enum NOT NULL,
          status transactions_status_enum DEFAULT 'pending',
          amount DECIMAL(10,2) NOT NULL,
          currency VARCHAR DEFAULT 'KES',
          msisdn VARCHAR,
          description TEXT,
          reference VARCHAR,
          "airtelTransactionId" VARCHAR,
          "userId" INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Created transactions table');

      // Create bet status enum
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE bets_status_enum AS ENUM ('pending', 'won', 'lost', 'cancelled');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // Create bets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS bets (
          id SERIAL PRIMARY KEY,
          "betId" VARCHAR UNIQUE NOT NULL,
          "eventName" VARCHAR NOT NULL,
          "betType" VARCHAR NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          odds DECIMAL(5,2) NOT NULL,
          "potentialWinning" DECIMAL(10,2) NOT NULL,
          status bets_status_enum DEFAULT 'pending',
          "userId" INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Created bets table');

      console.log('All tables created successfully!');
    } else {
      console.log('Tables already exist:', result.rows.map(row => row.table_name));
    }

    // Verify tables exist
    const finalCheck = await client.query(checkTablesQuery);
    console.log('Final check - existing tables:', finalCheck.rows.map(row => row.table_name));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkAndCreateTables();
