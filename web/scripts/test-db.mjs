import dotenv from "dotenv";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { Pool } = pg;
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("FAIL: DATABASE_URL not set in .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function main() {
  console.log("Testing Web Application Node.js connection to Supabase via DATABASE_URL...");
  try {
    const client = await pool.connect();
    const res = await client.query("SELECT current_database(), current_user, version();");
    console.log(`SUCCESS: Connected from Node.js!`);
    console.log(`  Database: ${res.rows[0].current_database}`);
    console.log(`  User:     ${res.rows[0].current_user}`);
    console.log(`  Version:  ${res.rows[0].version.split(",")[0]}`);

    const tables = await client.query(`
      SELECT count(*)::int as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log(`  Public tables accessible: ${tables.rows[0].count}`);
    client.release();
    await pool.end();
    console.log("Node.js DB verification completed successfully!");
  } catch (err) {
    console.error("FAIL: Node.js connection failed:", err.message);
    process.exit(1);
  }
}

main();
