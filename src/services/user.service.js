import bcrypt from "bcrypt";
import { env } from "../config/env.config.js";
import { with_transaction } from "../config/db.js";
import { ApiError } from "../utils/api_error.util.js";
import {
  find_user_by_id,
  find_user_auth_by_id,
  update_user_profile,
  update_user_password,
} from "../models/user.model.js";
import { revoke_all_user_refresh_tokens } from "../models/token.model.js";

export const get_my_profile = async (user_id) => {
  const user = await find_user_by_id(user_id);
  if (!user) {
    throw ApiError.not_found("User profile not found.", "USER_NOT_FOUND");
  }
  return user;
};

export const update_my_profile = async (user_id, payload) => {
  const updates = {};

  if (payload.full_name !== undefined) {
    updates.full_name = payload.full_name;
  }

  if (payload.avatar_url !== undefined) {
    updates.avatar_url = payload.avatar_url === "" ? null : payload.avatar_url;
  }

  if (Object.keys(updates).length === 0) {
    throw ApiError.bad_request(
      "Provide at least one field to update.",
      [],
      "EMPTY_UPDATE_PAYLOAD"
    );
  }

  const updated_user = await update_user_profile(user_id, updates);
  if (!updated_user) {
    throw ApiError.not_found("User profile not found.", "USER_NOT_FOUND");
  }

  return updated_user;
};

export const change_my_password = async (
  user_id,
  { current_password, new_password }
) => {
  if (current_password === new_password) {
    throw ApiError.bad_request(
      "New password must be different from the current password.",
      [],
      "SAME_PASSWORD"
    );
  }

  const user = await find_user_auth_by_id(user_id);
  if (!user) {
    throw ApiError.not_found("User not found.", "USER_NOT_FOUND");
  }

  const is_current_valid = await bcrypt.compare(
    current_password,
    user.password_hash
  );
  if (!is_current_valid) {
    throw ApiError.unauthorized(
      "Current password is incorrect.",
      "INVALID_CURRENT_PASSWORD"
    );
  }

  const new_password_hash = await bcrypt.hash(
    new_password,
    env.bcrypt_salt_rounds
  );

  await with_transaction(async (client) => {
    await update_user_password(user_id, new_password_hash, client);
    await revoke_all_user_refresh_tokens(user_id, client);
  });
};