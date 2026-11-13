import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.config.js";
import { with_transaction } from "../config/db.js";
import { ApiError } from "../utils/api_error.util.js";
import {
  create_user,
  find_user_by_email,
  find_user_auth_by_id,
  update_last_login,
} from "../models/user.model.js";
import {
  create_refresh_token,
  find_refresh_token_by_hash,
  revoke_refresh_token_by_hash,
  revoke_all_user_refresh_tokens,
} from "../models/token.model.js";

const hash_token = (raw_token) => {
  return crypto.createHash("sha256").update(raw_token).digest("hex");
};

const sign_access_token = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    env.jwt_secret,
    { expiresIn: env.jwt_expires_in }
  );
};

const sign_refresh_token = (user) => {
  return jwt.sign(
    {
      id: user.id,
      token_type: "refresh",
      jti: crypto.randomUUID(),
    },
    env.jwt_refresh_secret,
    { expiresIn: env.jwt_refresh_expires_in }
  );
};

const extract_token_expiry = (token) => {
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.exp) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(decoded.exp * 1000);
};

const issue_token_pair = async (user, db_client) => {
  const access_token = sign_access_token(user);
  const refresh_token = sign_refresh_token(user);

  await create_refresh_token(
    {
      user_id: user.id,
      token_hash: hash_token(refresh_token),
      expires_at: extract_token_expiry(refresh_token),
    },
    db_client
  );

  return { access_token, refresh_token };
};

export const register_user = async ({ email, password, full_name }) => {
  const existing_user = await find_user_by_email(email);
  if (existing_user) {
    throw ApiError.conflict(
      "An account with this email already exists.",
      "EMAIL_ALREADY_EXISTS"
    );
  }

  const password_hash = await bcrypt.hash(password, env.bcrypt_salt_rounds);

  return with_transaction(async (client) => {
    const new_user = await create_user(
      {
        email,
        password_hash,
        full_name,
        role: "user",
      },
      client
    );

    const tokens = await issue_token_pair(new_user, client);

    return {
      user: new_user,
      tokens,
    };
  });
};

export const login_user = async ({ email, password }) => {
  const existing_user = await find_user_by_email(email);
  if (!existing_user) {
    throw ApiError.unauthorized(
      "Invalid email or password.",
      "INVALID_CREDENTIALS"
    );
  }

  if (!existing_user.is_active) {
    throw ApiError.forbidden(
      "This account has been deactivated.",
      "ACCOUNT_DEACTIVATED"
    );
  }

  const is_password_valid = await bcrypt.compare(
    password,
    existing_user.password_hash
  );
  if (!is_password_valid) {
    throw ApiError.unauthorized(
      "Invalid email or password.",
      "INVALID_CREDENTIALS"
    );
  }

  return with_transaction(async (client) => {
    const updated_user = await update_last_login(existing_user.id, client);
    const tokens = await issue_token_pair(updated_user, client);

    return {
      user: updated_user,
      tokens,
    };
  });
};

export const refresh_user_tokens = async (raw_refresh_token) => {
  let decoded;
  try {
    decoded = jwt.verify(raw_refresh_token, env.jwt_refresh_secret);
  } catch (error) {
    throw ApiError.unauthorized(
      "Invalid or expired refresh token.",
      "INVALID_REFRESH_TOKEN"
    );
  }

  const token_hash = hash_token(raw_refresh_token);

  return with_transaction(async (client) => {
    const stored_token = await find_refresh_token_by_hash(token_hash, client);

    if (!stored_token) {
      throw ApiError.unauthorized(
        "Refresh token not recognized.",
        "INVALID_REFRESH_TOKEN"
      );
    }

    // Reuse detection: if a revoked token is replayed, revoke all sessions for safety
    if (stored_token.revoked_at) {
      await revoke_all_user_refresh_tokens(stored_token.user_id, client);
      throw ApiError.unauthorized(
        "Refresh token reuse detected. Please log in again.",
        "TOKEN_REUSE_DETECTED"
      );
    }

    if (new Date(stored_token.expires_at) <= new Date()) {
      await revoke_refresh_token_by_hash(token_hash, client);
      throw ApiError.unauthorized(
        "Refresh token has expired.",
        "REFRESH_TOKEN_EXPIRED"
      );
    }

    const user = await find_user_auth_by_id(decoded.id, client);
    if (!user || !user.is_active) {
      throw ApiError.unauthorized(
        "User account is unavailable.",
        "UNAUTHORIZED_ACCESS"
      );
    }

    await revoke_refresh_token_by_hash(token_hash, client);
    const tokens = await issue_token_pair(user, client);

    return { tokens };
  });
};

export const logout_user = async (raw_refresh_token) => {
  if (!raw_refresh_token) {
    return;
  }

  const token_hash = hash_token(raw_refresh_token);
  await revoke_refresh_token_by_hash(token_hash);
};