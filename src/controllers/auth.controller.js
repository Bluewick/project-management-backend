import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import {
  register_user,
  login_user,
  refresh_user_tokens,
  logout_user,
} from "../services/auth.service.js";

export const register = async_handler(async (req, res) => {
  const { email, password, full_name } = req.body;
  const result = await register_user({ email, password, full_name });

  return send_success(
    res,
    201,
    "User registered successfully.",
    result
  );
});

export const login = async_handler(async (req, res) => {
  const { email, password } = req.body;
  const result = await login_user({ email, password });

  return send_success(res, 200, "Login successful.", result);
});

export const refresh_token = async_handler(async (req, res) => {
  const { refresh_token: token } = req.body;
  const result = await refresh_user_tokens(token);

  return send_success(res, 200, "Tokens refreshed successfully.", result);
});

export const logout = async_handler(async (req, res) => {
  const { refresh_token: token } = req.body;
  await logout_user(token);

  return send_success(res, 200, "Logged out successfully.", null);
});