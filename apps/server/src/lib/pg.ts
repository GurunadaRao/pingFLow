import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

function buildConnectionString(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
  }

  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");

  if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

const pool = new Pool({
  connectionString: buildConnectionString(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 15000),
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

export default pool;
