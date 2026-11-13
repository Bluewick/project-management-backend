import { ApiError } from "../utils/api_error.util.js";
import { find_issue_by_id } from "../models/issue.model.js";
import {
  create_activity,
  create_activities_bulk,
  list_issue_activities,
} from "../models/activity.model.js";

export const log_issue_activity = async (
  { issue_id, actor_id, action, metadata = {} },
  db_client = null
) => {
  return create_activity(
    { issue_id, actor_id, action, metadata },
    db_client
  );
};

export const log_issue_activities_bulk = async (
  activities,
  db_client = null
) => {
  return create_activities_bulk(activities, db_client);
};

export const get_issue_activity_log = async (
  project_id,
  issue_id,
  { sort_order = "desc", page = 1, limit = 50 }
) => {
  const issue = await find_issue_by_id(issue_id, project_id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }

  const safe_page = Math.max(1, page);
  const safe_limit = Math.min(200, Math.max(1, limit));
  const offset = (safe_page - 1) * safe_limit;

  const { activities, total } = await list_issue_activities(issue_id, {
    sort_order,
    limit: safe_limit,
    offset,
  });

  return {
    activities,
    meta: {
      page: safe_page,
      limit: safe_limit,
      total,
      total_pages: Math.ceil(total / safe_limit) || 1,
    },
  };
};