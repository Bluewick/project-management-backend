import { ApiError } from "../utils/api_error.util.js";
import { async_handler } from "../utils/async_handler.util.js";
import { find_project_membership_with_project } from "../models/project_member.model.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PROJECT_ROLES = Object.freeze([
  "admin",
  "manager",
  "developer",
  "viewer",
]);

export const authorize_project_role = (...allowed_roles) => {
  return async_handler(async (req, res, next) => {
    if (!req.user || !req.user.id) {
      throw ApiError.unauthorized("Authentication required.");
    }

    const project_id = req.params.projectId;
    if (!project_id || !UUID_REGEX.test(project_id)) {
      throw ApiError.bad_request(
        "Valid projectId UUID parameter is required.",
        [],
        "INVALID_PROJECT_ID"
      );
    }

    const record = await find_project_membership_with_project(
      project_id,
      req.user.id
    );

    if (!record) {
      throw ApiError.not_found("Project not found.", "PROJECT_NOT_FOUND");
    }

    if (!record.member_id) {
      throw ApiError.forbidden(
        "You are not a member of this project.",
        "NOT_PROJECT_MEMBER"
      );
    }

    if (
      allowed_roles.length > 0 &&
      !allowed_roles.includes(record.member_role)
    ) {
      throw ApiError.forbidden(
        "You do not have the required project role for this action.",
        "INSUFFICIENT_PROJECT_ROLE"
      );
    }

    req.project = {
      id: record.project_id,
      name: record.project_name,
      key_prefix: record.key_prefix,
      owner_id: record.owner_id,
      is_archived: record.is_archived,
    };

    req.project_member = {
      id: record.member_id,
      project_id: record.project_id,
      user_id: req.user.id,
      role: record.member_role,
      joined_at: record.joined_at,
    };

    return next();
  });
};