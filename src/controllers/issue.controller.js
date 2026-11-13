import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import {
  create_new_issue,
  get_project_issues,
  get_issue_details,
  get_issue_details_by_key,
  update_issue_details,
  move_kanban_issue,
  delete_existing_issue,
  add_label_to_issue,
  remove_label_from_issue,
} from "../services/issue.service.js";

export const create_issue = async_handler(async (req, res) => {
  const issue = await create_new_issue(req.project, req.user.id, req.body);

  return send_success(res, 201, "Issue created successfully.", issue);
});

export const list_issues = async_handler(async (req, res) => {
  const result = await get_project_issues(
    req.params.projectId,
    req.user.id,
    req.query
  );

  return send_success(
    res,
    200,
    "Issues fetched successfully.",
    result.issues,
    result.meta
  );
});

export const get_issue = async_handler(async (req, res) => {
  const issue = await get_issue_details(
    req.params.projectId,
    req.params.issueId
  );

  return send_success(res, 200, "Issue fetched successfully.", issue);
});

export const get_issue_by_key = async_handler(async (req, res) => {
  const issue = await get_issue_details_by_key(
    req.params.projectId,
    req.params.issueKey
  );

  return send_success(res, 200, "Issue fetched successfully.", issue);
});

export const update_issue = async_handler(async (req, res) => {
  const updated = await update_issue_details(
    req.project,
    req.params.issueId,
    req.user.id,
    req.body
  );

  return send_success(res, 200, "Issue updated successfully.", updated);
});

export const move_issue = async_handler(async (req, res) => {
  const moved = await move_kanban_issue(
    req.project,
    req.params.issueId,
    req.user.id,
    req.body
  );

  return send_success(res, 200, "Issue moved successfully.", moved);
});

export const delete_issue = async_handler(async (req, res) => {
  await delete_existing_issue(
    req.project,
    req.project_member,
    req.params.issueId
  );

  return send_success(res, 200, "Issue deleted successfully.", null);
});

export const attach_label = async_handler(async (req, res) => {
  const issue = await add_label_to_issue(
    req.project,
    req.params.issueId,
    req.params.labelId,
    req.user.id
  );

  return send_success(res, 200, "Label attached to issue.", issue);
});

export const detach_label = async_handler(async (req, res) => {
  const issue = await remove_label_from_issue(
    req.project,
    req.params.issueId,
    req.params.labelId,
    req.user.id
  );

  return send_success(res, 200, "Label detached from issue.", issue);
});