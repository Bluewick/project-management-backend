import express from "express";
import { authenticate_user } from "../middleware/auth.middleware.js";
import { validate_request } from "../middleware/validate.middleware.js";
import {
  get_profile,
  update_profile,
  change_password,
} from "../controllers/user.controller.js";

const router = express.Router();

const is_valid_http_url = (value) => {
  if (value === "") return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "avatar_url must use http or https protocol.";
    }
    return null;
  } catch {
    return "avatar_url must be a valid URL.";
  }
};

const update_profile_schema = {
  body: {
    full_name: {
      required: false,
      type: "string",
      trim: true,
      min: 2,
      max: 120,
    },
    avatar_url: {
      required: false,
      type: "string",
      trim: true,
      max: 500,
      custom: is_valid_http_url,
    },
  },
};

const change_password_schema = {
  body: {
    current_password: { required: true, type: "string", min: 1, max: 128 },
    new_password: { required: true, type: "string", min: 8, max: 128 },
  },
};

router.get("/me", authenticate_user, get_profile);
router.patch(
  "/me",
  authenticate_user,
  validate_request(update_profile_schema),
  update_profile
);
router.patch(
  "/me/password",
  authenticate_user,
  validate_request(change_password_schema),
  change_password
);

export default router;