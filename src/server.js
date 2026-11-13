import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.config.js";
import { pool, test_db_connection } from "./config/db.js";
import health_routes from "./routes/health.routes.js";

import {
  not_found_handler,
  error_handler,
} from "./middleware/error.middleware.js";

import auth_routes from "./routes/auth.routes.js";
import user_routes from "./routes/user.routes.js";
import project_routes from "./routes/project.routes.js";


dotenv.config();

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

const CLIENT = process.env.FRONTEND_URL;

const allowedOrigins = [
  CLIENT,
  "http://localhost:5253",
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean);

const allowedRegexPatterns = [/^https:\/\/.*\.vercel\.app$/];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const isAllowed =
      allowedOrigins.includes(origin) ||
      allowedRegexPatterns.some((pattern) => pattern.test(origin));

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy error: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-link-password"],
};

// Middleware
app.use(cors(corsOptions));

// Global API rate limiter
const global_limiter = rateLimit({
  windowMs: env.rate_limit_window_ms,
  max: env.rate_limit_max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
      details: [],
    },
  },
});

app.use("/api", global_limiter);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));



app.use("/api/health", health_routes);
app.use("/api/auth", auth_routes);
app.use("/api/users", user_routes);
app.use("/api/projects", project_routes);

// 404 & Centralized Error Handlers
app.use(not_found_handler);
app.use(error_handler);

app.get("/", (req, res) => {
  res.send("Backend Server is running 🚀");
});

const PORT = process.env.PORT || 5213;

try {
  await test_db_connection();
  console.log("PostgreSQL (Neon) connection established.");
  const result = await pool.query("SELECT NOW()");
  console.log("✅ PostgreSQL Connected");
  console.log(
    `🌐 Traceboard backend running in ${env.node_env} mode on port ${env.port}`,
  );
  console.log(result.rows[0]);
} catch (err) {
  console.error("❌ Database Connection Failed");
  console.error(err.message);
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
