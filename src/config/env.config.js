import dotenv from "dotenv";

dotenv.config();

const parse_integer = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parse_boolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value.toLowerCase() === "true";
};

const required_env_vars = ["DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"];

for (const key of required_env_vars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const is_neon_or_prod =
  process.env.DATABASE_URL.includes("neon.tech") ||
  process.env.NODE_ENV === "production";

export const env = Object.freeze({
  node_env: process.env.NODE_ENV || "development",
  port: parse_integer(process.env.PORT, 5000),
  client_origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  database_url: process.env.DATABASE_URL,
  db_ssl: parse_boolean(process.env.DB_SSL, is_neon_or_prod),
  rate_limit_window_ms: parse_integer(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rate_limit_max: parse_integer(process.env.RATE_LIMIT_MAX, 100),
  auth_rate_limit_max: parse_integer(process.env.AUTH_RATE_LIMIT_MAX, 15),
  jwt_secret: process.env.JWT_SECRET,
  jwt_expires_in: process.env.JWT_EXPIRES_IN || "15m",
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  bcrypt_salt_rounds: parse_integer(process.env.BCRYPT_SALT_ROUNDS, 12),
});