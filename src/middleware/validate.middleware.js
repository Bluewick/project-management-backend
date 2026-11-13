import { ApiError } from "../utils/api_error.util.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validate_field = (location, field, value, rules, errors) => {
  const is_empty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "");

  if (rules.required && is_empty) {
    errors.push({
      location,
      field,
      message: `${field} is required.`,
    });
    return value;
  }

  if (is_empty) {
    return value;
  }

  let normalized = value;

  if (rules.trim && typeof normalized === "string") {
    normalized = normalized.trim();
  }

  if (rules.type === "string") {
    if (typeof normalized !== "string") {
      errors.push({ location, field, message: `${field} must be a string.` });
      return normalized;
    }
    if (rules.min !== undefined && normalized.length < rules.min) {
      errors.push({
        location,
        field,
        message: `${field} must be at least ${rules.min} characters.`,
      });
    }
    if (rules.max !== undefined && normalized.length > rules.max) {
      errors.push({
        location,
        field,
        message: `${field} must be at most ${rules.max} characters.`,
      });
    }
  }

  if (rules.type === "email") {
    if (typeof normalized !== "string" || !EMAIL_REGEX.test(normalized)) {
      errors.push({
        location,
        field,
        message: `${field} must be a valid email address.`,
      });
    } else {
      normalized = normalized.toLowerCase();
    }
  }

  if (rules.type === "uuid") {
    if (typeof normalized !== "string" || !UUID_REGEX.test(normalized)) {
      errors.push({
        location,
        field,
        message: `${field} must be a valid UUID.`,
      });
    }
  }

  if (rules.type === "number") {
    const num = typeof normalized === "number" ? normalized : Number(normalized);
    if (Number.isNaN(num)) {
      errors.push({ location, field, message: `${field} must be a number.` });
      return normalized;
    }
    normalized = num;
    if (rules.min !== undefined && normalized < rules.min) {
      errors.push({
        location,
        field,
        message: `${field} must be at least ${rules.min}.`,
      });
    }
    if (rules.max !== undefined && normalized > rules.max) {
      errors.push({
        location,
        field,
        message: `${field} must be at most ${rules.max}.`,
      });
    }
  }

  if (rules.type === "boolean") {
    if (typeof normalized === "string") {
      if (normalized === "true") normalized = true;
      else if (normalized === "false") normalized = false;
    }
    if (typeof normalized !== "boolean") {
      errors.push({ location, field, message: `${field} must be a boolean.` });
    }
  }

  if (rules.type === "array" && !Array.isArray(normalized)) {
    errors.push({ location, field, message: `${field} must be an array.` });
  }

  if (rules.enum && !rules.enum.includes(normalized)) {
    errors.push({
      location,
      field,
      message: `${field} must be one of: ${rules.enum.join(", ")}.`,
    });
  }

  if (rules.pattern && typeof normalized === "string" && !rules.pattern.test(normalized)) {
    errors.push({
      location,
      field,
      message: rules.pattern_message || `${field} has an invalid format.`,
    });
  }

  if (typeof rules.custom === "function") {
    const custom_error = rules.custom(normalized);
    if (custom_error) {
      errors.push({ location, field, message: custom_error });
    }
  }

  return normalized;
};

export const validate_request = (schema) => {
  return (req, res, next) => {
    const errors = [];

    for (const location of ["params", "query", "body"]) {
      const location_schema = schema[location];
      if (!location_schema) continue;

      const source = req[location] || {};
      const sanitized = { ...source };

      for (const [field, rules] of Object.entries(location_schema)) {
        sanitized[field] = validate_field(
          location,
          field,
          source[field],
          rules,
          errors
        );
      }

      req[location] = sanitized;
    }

    if (errors.length > 0) {
      return next(ApiError.validation_error(errors));
    }

    return next();
  };
};