import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import {
  get_issue_comments,
  add_issue_comment,
  edit_issue_comment,
  remove_issue_comment,
} from "../services/comment.service.js";

export const list_comments = async_handler(async (req, res) => {
  const {
    parent_comment_id,
    top_level_only = false,
    page = 1,
    limit = 50,
  } = req.query;

  const result = await get_issue_comments(
    req.params.projectId,
    req.params.issueId,
    {
      parent_comment_id,
      top_level_only,
      page,
      limit,
    }
  );

  return send_success(
    res,
    200,
    "Comments fetched successfully.",
    result.comments,
    result.meta
  );
});

export const create_comment = async_handler(async (req, res) => {
  const { body, parent_comment_id } = req.body;
  const comment = await add_issue_comment(
    req.project,
    req.params.issueId,
    req.user.id,
    { body, parent_comment_id }
  );

  return send_success(res, 201, "Comment added successfully.", comment);
});

export const update_comment = async_handler(async (req, res) => {
  const updated = await edit_issue_comment(
    req.project,
    req.params.issueId,
    req.params.commentId,
    req.user.id,
    { body: req.body.body }
  );

  return send_success(res, 200, "Comment updated successfully.", updated);
});

export const delete_comment = async_handler(async (req, res) => {
  await remove_issue_comment(
    req.project,
    req.project_member,
    req.params.issueId,
    req.params.commentId
  );

  return send_success(res, 200, "Comment deleted successfully.", null);
});