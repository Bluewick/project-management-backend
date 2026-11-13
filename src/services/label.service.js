import { ApiError } from "../utils/api_error.util.js";
import {
  create_label,
  list_project_labels,
  find_label_by_id,
  update_label,
  delete_label,
} from "../models/label.model.js";

export const create_project_label = async (project, { name, color_hex }) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot create labels in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  return create_label({
    project_id: project.id,
    name,
    color_hex: color_hex ? color_hex.toUpperCase() : "#6366F1",
  });
};

export const get_project_labels = async (project_id) => {
  return list_project_labels(project_id);
};

export const update_project_label = async (project, label_id, payload) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot update labels in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  const existing = await find_label_by_id(label_id, project.id);
  if (!existing) {
    throw ApiError.not_found("Label not found.", "LABEL_NOT_FOUND");
  }

  const updates = {};
  if (payload.name !== undefined) {
    updates.name = payload.name;
  }
  if (payload.color_hex !== undefined) {
    updates.color_hex = payload.color_hex.toUpperCase();
  }

  if (Object.keys(updates).length === 0) {
    throw ApiError.bad_request(
      "Provide at least one field to update.",
      [],
      "EMPTY_UPDATE_PAYLOAD"
    );
  }

  return update_label(label_id, project.id, updates);
};

export const delete_project_label = async (project, label_id) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot delete labels in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  const deleted = await delete_label(label_id, project.id);
  if (!deleted) {
    throw ApiError.not_found("Label not found.", "LABEL_NOT_FOUND");
  }
};