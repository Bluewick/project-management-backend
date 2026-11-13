import { with_transaction } from "../config/db.js";
import { ApiError } from "../utils/api_error.util.js";
import {
  create_project,
  find_project_by_id,
  find_project_by_key_prefix,
  find_projects_for_user,
  update_project,
  delete_project,
} from "../models/project.model.js";
import { add_project_member } from "../models/project_member.model.js";

export const create_new_project = async (
  user_id,
  { name, key_prefix, description }
) => {
  const normalized_key = key_prefix.toUpperCase();

  const existing = await find_project_by_key_prefix(normalized_key);
  if (existing) {
    throw ApiError.conflict(
      `Project key prefix '${normalized_key}' is already in use.`,
      "PROJECT_KEY_CONFLICT"
    );
  }

  return with_transaction(async (client) => {
    const project = await create_project(
      {
        name,
        key_prefix: normalized_key,
        description: description || null,
        owner_id: user_id,
      },
      client
    );

    await add_project_member(
      {
        project_id: project.id,
        user_id,
        role: "admin",
      },
      client
    );

    return {
      ...project,
      my_role: "admin",
      member_count: 1,
    };
  });
};

export const list_user_projects = async (
  user_id,
  { include_archived = false, page = 1, limit = 20 }
) => {
  const safe_page = Math.max(1, page);
  const safe_limit = Math.min(100, Math.max(1, limit));
  const offset = (safe_page - 1) * safe_limit;

  const { projects, total } = await find_projects_for_user(user_id, {
    include_archived,
    limit: safe_limit,
    offset,
  });

  return {
    projects,
    meta: {
      page: safe_page,
      limit: safe_limit,
      total,
      total_pages: Math.ceil(total / safe_limit) || 1,
    },
  };
};

export const get_project_details = async (project_id, member_role) => {
  const project = await find_project_by_id(project_id);
  if (!project) {
    throw ApiError.not_found("Project not found.", "PROJECT_NOT_FOUND");
  }

  return {
    ...project,
    my_role: member_role,
  };
};

export const update_project_settings = async (project_id, payload) => {
  const existing = await find_project_by_id(project_id);
  if (!existing) {
    throw ApiError.not_found("Project not found.", "PROJECT_NOT_FOUND");
  }

  const updates = {};

  if (payload.name !== undefined) {
    updates.name = payload.name;
  }

  if (payload.description !== undefined) {
    updates.description = payload.description === "" ? null : payload.description;
  }

  if (payload.is_archived !== undefined) {
    updates.is_archived = payload.is_archived;
  }

  if (payload.key_prefix !== undefined) {
    const normalized_key = payload.key_prefix.toUpperCase();
    if (normalized_key !== existing.key_prefix) {
      if (existing.issue_counter > 0) {
        throw ApiError.bad_request(
          "Project key prefix cannot be changed after issues have been created.",
          [],
          "PROJECT_KEY_LOCKED"
        );
      }

      const duplicate = await find_project_by_key_prefix(normalized_key);
      if (duplicate) {
        throw ApiError.conflict(
          `Project key prefix '${normalized_key}' is already in use.`,
          "PROJECT_KEY_CONFLICT"
        );
      }

      updates.key_prefix = normalized_key;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw ApiError.bad_request(
      "Provide at least one field to update.",
      [],
      "EMPTY_UPDATE_PAYLOAD"
    );
  }

  return update_project(project_id, updates);
};

export const delete_existing_project = async (project_id) => {
  const deleted = await delete_project(project_id);
  if (!deleted) {
    throw ApiError.not_found("Project not found.", "PROJECT_NOT_FOUND");
  }
};