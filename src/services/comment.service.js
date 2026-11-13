import { with_transaction } from "../config/db.js";
import { ApiError } from "../utils/api_error.util.js";
import { find_issue_by_id } from "../models/issue.model.js";
import {
  find_mentioned_project_members,
  create_comment,
  find_comment_by_id,
  list_issue_comments,
  update_comment,
  delete_comment,
} from "../models/comment.model.js";
import { log_issue_activity } from "./activity.service.js";

// Matches @[Name](uuid) or @email@domain.com
const MENTION_UUID_PATTERN =
  /@\[[^\]]+\]\(([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\)/gi;
const MENTION_EMAIL_PATTERN =
  /(?:^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

const extract_and_resolve_mentions = async (
  project_id,
  body,
  db_client = null
) => {
  const user_ids = new Set();
  const emails = new Set();

  for (const match of body.matchAll(MENTION_UUID_PATTERN)) {
    user_ids.add(match[1].toLowerCase());
  }

  for (const match of body.matchAll(MENTION_EMAIL_PATTERN)) {
    emails.add(match[1].toLowerCase());
  }

  if (user_ids.size === 0 && emails.size === 0) {
    return [];
  }

  const members = await find_mentioned_project_members(
    project_id,
    [...user_ids],
    [...emails],
    db_client
  );

  return members.map((member) => ({
    user_id: member.id,
    full_name: member.full_name,
    email: member.email,
  }));
};

export const get_issue_comments = async (
  project_id,
  issue_id,
  { parent_comment_id = undefined, top_level_only = false, page = 1, limit = 50 }
) => {
  const issue = await find_issue_by_id(issue_id, project_id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }

  const safe_page = Math.max(1, page);
  const safe_limit = Math.min(200, Math.max(1, limit));
  const offset = (safe_page - 1) * safe_limit;

  const resolved_parent_filter = top_level_only ? null : parent_comment_id;

  const { comments, total } = await list_issue_comments(issue_id, {
    parent_comment_id: resolved_parent_filter,
    limit: safe_limit,
    offset,
  });

  return {
    comments,
    meta: {
      page: safe_page,
      limit: safe_limit,
      total,
      total_pages: Math.ceil(total / safe_limit) || 1,
    },
  };
};

export const add_issue_comment = async (
  project,
  issue_id,
  author_id,
  { body, parent_comment_id = null }
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot comment on issues in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  return with_transaction(async (client) => {
    const issue = await find_issue_by_id(issue_id, project.id, client);
    if (!issue) {
      throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
    }

    if (parent_comment_id) {
      const parent_comment = await find_comment_by_id(
        parent_comment_id,
        issue_id,
        client
      );
      if (!parent_comment) {
        throw ApiError.not_found(
          "Parent comment not found on this issue.",
          "PARENT_COMMENT_NOT_FOUND"
        );
      }
    }

    const mentions = await extract_and_resolve_mentions(
      project.id,
      body,
      client
    );

    const created = await create_comment(
      {
        issue_id,
        author_id,
        parent_comment_id,
        body,
        mentions,
      },
      client
    );

    await log_issue_activity(
      {
        issue_id,
        actor_id: author_id,
        action: "comment_added",
        metadata: {
          comment_id: created.id,
          parent_comment_id,
          mentioned_user_ids: mentions.map((m) => m.user_id),
        },
      },
      client
    );

    return created;
  });
};

export const edit_issue_comment = async (
  project,
  issue_id,
  comment_id,
  acting_user_id,
  { body }
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot edit comments in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  return with_transaction(async (client) => {
    const issue = await find_issue_by_id(issue_id, project.id, client);
    if (!issue) {
      throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
    }

    const existing = await find_comment_by_id(comment_id, issue_id, client);
    if (!existing) {
      throw ApiError.not_found("Comment not found.", "COMMENT_NOT_FOUND");
    }

    if (existing.author_id !== acting_user_id) {
      throw ApiError.forbidden(
        "Only the author can edit this comment.",
        "COMMENT_EDIT_FORBIDDEN"
      );
    }

    const mentions = await extract_and_resolve_mentions(
      project.id,
      body,
      client
    );

    return update_comment(
      comment_id,
      issue_id,
      { body, mentions },
      client
    );
  });
};

export const remove_issue_comment = async (
  project,
  acting_member,
  issue_id,
  comment_id
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot delete comments in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  return with_transaction(async (client) => {
    const issue = await find_issue_by_id(issue_id, project.id, client);
    if (!issue) {
      throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
    }

    const existing = await find_comment_by_id(comment_id, issue_id, client);
    if (!existing) {
      throw ApiError.not_found("Comment not found.", "COMMENT_NOT_FOUND");
    }

    const is_author = existing.author_id === acting_member.user_id;
    const is_admin = acting_member.role === "admin";

    if (!is_author && !is_admin) {
      throw ApiError.forbidden(
        "Only the comment author or a project admin can delete this comment.",
        "COMMENT_DELETE_FORBIDDEN"
      );
    }

    return delete_comment(comment_id, issue_id, client);
  });
};