import { env } from "../config/env.config.js";
import { ApiError } from "../utils/api_error.util.js";
import { send_error } from "../utils/response.util.js";

const map_postgres_error = (err) => {
  switch (err.code) {
    case "23505":
      return ApiError.conflict(
        "A record with the provided unique value already exists.",
        "DUPLICATE_RESOURCE"
      );
    case "23503":
      return ApiError.bad_request(
        "Referenced resource does not exist.",
        [],
        "FOREIGN_KEY_VIOLATION"
      );
    case "22P02":
      return ApiError.bad_request(
        "Invalid identifier or data syntax.",
        [],
        "INVALID_INPUT_SYNTAX"
      );
    case "23502":
      return ApiError.bad_request(
        `Missing required database field: ${err.column || "unknown"}.`,
        [],
        "NOT_NULL_VIOLATION"
      );
    default:
      return null;
  }
};

export const not_found_handler = (req, res, next) => {
  next(
    ApiError.not_found(
      `Route ${req.method} ${req.originalUrl} not found.`,
      "ROUTE_NOT_FOUND"
    )
  );
};

export const error_handler = (err, req, res, next) => {
  let normalized_error = err;

  if (!(normalized_error instanceof ApiError)) {
    const pg_error = map_postgres_error(err);
    if (pg_error) {
      normalized_error = pg_error;
    } else if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      normalized_error = ApiError.bad_request(
        "Malformed JSON request payload.",
        [],
        "INVALID_JSON"
      );
    } else {
      normalized_error = ApiError.internal(
        env.node_env === "production"
          ? "Internal server error."
          : err.message || "Internal server error."
      );
    }
  }

  if (env.node_env !== "production" && normalized_error.status_code >= 500) {
    console.error("[Server Error]:", err);
  }

  return send_error(
    res,
    normalized_error.status_code,
    normalized_error.code,
    normalized_error.message,
    normalized_error.details
  );
};