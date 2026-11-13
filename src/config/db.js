import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const MODE = process.env.NODE_ENV || "development";
const { Pool } = pg;

export const pool = MODE === "production"
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });


pool.on("connect", (client) => {
  console.log(`Connected to PostgreSQL Database: ${client.database}`);
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
  process.exit(-1);
});

// if (MODE === 'production') {
pool.on("connect", (client) => {
  client.query("SET search_path TO public");
  console.log(`Connected to PostgreSQL Database: ${client.database}`);
});
// }

pool.query("SELECT current_database(), current_schema()", (err, res) => {
  if (err) console.error(err);
  else console.log("Currently connected to:", res.rows[0]);
});

export const query = async (text, params = []) => {
  return pool.query(text, params);
};

export const with_transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const test_db_connection = async () => {
  const result = await pool.query("SELECT NOW() AS server_time");
  return result.rows[0];
};

// export default pool;