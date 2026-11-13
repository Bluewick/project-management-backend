import jwt from "jsonwebtoken";
import { env } from "../config/env.config.js";
import { send_error } from "../utils/response.util.js";

export const authenticate_user = (req, res, next) => {
  try {
    const auth_header = req.headers.authorization;

    if (!auth_header) {
      return send_error(
        res,
        401,
        "UNAUTHORIZED_ACCESS",
        "Authorization header missing."
      );
    }

    if (!auth_header.startsWith("Bearer ")) {
      return send_error(
        res,
        401,
        "UNAUTHORIZED_ACCESS",
        "Invalid authorization format."
      );
    }

    const token = auth_header.split(" ")[1];

    if (!token) {
      return send_error(res, 401, "UNAUTHORIZED_ACCESS", "Token missing.");
    }

    const decoded = jwt.verify(token, env.jwt_secret);
    req.user = decoded;

    return next();
  } catch (error) {
    return send_error(
      res,
      401,
      "UNAUTHORIZED_ACCESS",
      "Invalid or expired token."
    );
  }
};

export const authenticateUser = authenticate_user;

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return send_error(res, 401, "UNAUTHORIZED_ACCESS", "Unauthorized.");
    }

    if (!roles.includes(req.user.role)) {
      return send_error(res, 403, "FORBIDDEN", "Forbidden.");
    }

    return next();
  };
};