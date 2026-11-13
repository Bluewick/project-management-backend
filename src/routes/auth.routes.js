import express from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.config.js";
import { validate_request } from "../middleware/validate.middleware.js";
import {
  register,
  login,
  refresh_token,
  logout,
} from "../controllers/auth.controller.js";

const router = express.Router();

const auth_limiter = rateLimit({
  windowMs: env.rate_limit_window_ms,
  max: env.auth_rate_limit_max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Please try again later.",
      details: [],
    },
  },
});

const register_schema = {
  body: {
    email: { required: true, type: "email", trim: true, max: 255 },
    password: { required: true, type: "string", min: 8, max: 128 },
    full_name: { required: true, type: "string", trim: true, min: 2, max: 120 },
  },
};

const login_schema = {
  body: {
    email: { required: true, type: "email", trim: true },
    password: { required: true, type: "string", min: 1, max: 128 },
  },
};

const token_schema = {
  body: {
    refresh_token: { required: true, type: "string", trim: true, min: 10 },
  },
};

router.post("/register", auth_limiter, validate_request(register_schema), register);
router.post("/login", auth_limiter, validate_request(login_schema), login);
router.post("/refresh", validate_request(token_schema), refresh_token);
router.post("/logout", validate_request(token_schema), logout);

export default router;