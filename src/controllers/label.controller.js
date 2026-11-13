import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import {
  create_project_label,
  get_project_labels,
  update_project_label,
  delete_project_label,
} from "../services/label.service.js";

export const create_label = async_handler(async (req, res) => {
  const label = await create_project_label(req.project, req.body);

  return send_success(res, 201, "Label created successfully.", label);
});

export const list_labels = async_handler(async (req, res) => {
  const labels = await get_project_labels(req.params.projectId);

  return send_success(res, 200, "Labels fetched successfully.", labels);
});

export const update_label = async_handler(async (req, res) => {
  const updated = await update_project_label(
    req.project,
    req.params.labelId,
    req.body
  );

  return send_success(res, 200, "Label updated successfully.", updated);
});

export const delete_label = async_handler(async (req, res) => {
  await delete_project_label(req.project, req.params.labelId);

  return send_success(res, 200, "Label deleted successfully.", null);
});