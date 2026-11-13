import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import {
  get_my_profile,
  update_my_profile,
  change_my_password,
} from "../services/user.service.js";

export const get_profile = async_handler(async (req, res) => {
  const profile = await get_my_profile(req.user.id);

  return send_success(
    res,
    200,
    "User profile fetched successfully.",
    profile
  );
});

export const update_profile = async_handler(async (req, res) => {
  const { full_name, avatar_url } = req.body;
  const updated_profile = await update_my_profile(req.user.id, {
    full_name,
    avatar_url,
  });

  return send_success(
    res,
    200,
    "User profile updated successfully.",
    updated_profile
  );
});

export const change_password = async_handler(async (req, res) => {
  const { current_password, new_password } = req.body;
  await change_my_password(req.user.id, {
    current_password,
    new_password,
  });

  return send_success(
    res,
    200,
    "Password updated successfully. Please log in again on other devices.",
    null
  );
});