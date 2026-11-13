export class ApiError extends Error {
  constructor(status_code, code, message, details = []) {
    super(message);
    this.name = "ApiError";
    this.status_code = status_code;
    this.code = code;
    this.details = details;
    this.is_operational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static bad_request(message = "Bad request.", details = [], code = "BAD_REQUEST") {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(
    message = "Invalid or expired token.",
    code = "UNAUTHORIZED_ACCESS"
  ) {
    return new ApiError(401, code, message);
  }

  static forbidden(
    message = "You do not have permission to perform this action.",
    code = "FORBIDDEN"
  ) {
    return new ApiError(403, code, message);
  }

  static not_found(message = "Resource not found.", code = "RESOURCE_NOT_FOUND") {
    return new ApiError(404, code, message);
  }

  static conflict(message = "Resource already exists.", code = "RESOURCE_CONFLICT") {
    return new ApiError(409, code, message);
  }

  static validation_error(details = [], message = "Request validation failed.") {
    return new ApiError(422, "VALIDATION_ERROR", message, details);
  }

  static internal(message = "Internal server error.") {
    return new ApiError(500, "INTERNAL_SERVER_ERROR", message);
  }
}