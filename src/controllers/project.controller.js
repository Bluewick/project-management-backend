import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import {
  create_new_project,
  list_user_projects,
  get_project_details,
  update_project_settings,
  delete_existing_project,
} from "../services/project.service.js";

export const create_project = async_handler(async (req, res) => {
  const { name, key_prefix, description } = req.body;
  const project = await create_new_project(req.user.id, {
    name,
    key_prefix,
    description,
  });

  return send_success(
    res,
    201,
    "Project created successfully.",
    project
  );
});

export const get_my_projects = async_handler(async (req, res) => {
  const { include_archived = false, page = 1, limit = 20 } = req.query;
  const result = await list_user_projects(req.user.id, {
    include_archived,
    page,
    limit,
  });

  return send_success(
    res,
    200,
    "Projects fetched successfully.",
    result.projects,
    result.meta
  );
});

export const get_project_by_id = async_handler(async (req, res) => {
  const project = await get_project_details(
    req.params.projectId,
    req.project_member.role
  );

  return send_success(
    res,
    200,
    "Project fetched successfully.",
    project
  );
});

export const update_project = async_handler(async (req, res) => {
  const { name, key_prefix, description, is_archived } = req.body;
  const updated = await update_project_settings(req.params.projectId, {
    name,
    key_prefix,
    description,
    is_archived,
  });

  return send_success(
    res,
    200,
    "Project updated successfully.",
    updated
  );
});

export const delete_project = async_handler(async (req, res) => {
  await delete_existing_project(req.params.projectId);

  return send_success(res, 200, "Project deleted successfully.", null);
});