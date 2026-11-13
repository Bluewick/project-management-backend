import { with_transaction } from "../config/db.js";
import { ApiError } from "../utils/api_error.util.js";
import { find_project_member } from "../models/project_member.model.js";
import {
  find_label_by_id,
  find_labels_by_ids,
} from "../models/label.model.js";
import {
  increment_project_issue_counter,
  get_max_column_position,
  create_issue,
  replace_issue_labels,
  attach_label_to_issue,
  detach_label_from_issue,
  find_issue_by_id,
  find_issue_by_key,
  list_project_issues,
  update_issue,
  rebalance_column_positions,
  list_column_issue_positions,
  delete_issue,
} from "../models/issue.model.js";
import {
  log_issue_activity,
  log_issue_activities_bulk,
} from "./activity.service.js";

export const ISSUE_TYPES = Object.freeze(["bug", "feature", "task"]);
export const ISSUE_STATUSES = Object.freeze([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
]);
export const ISSUE_PRIORITIES = Object.freeze([
  "low",
  "medium",
  "high",
  "critical",
]);
export const ISSUE_SEVERITIES = Object.freeze([
  "minor",
  "major",
  "critical",
  "blocker",
]);
export const ISSUE_SORT_FIELDS = Object.freeze([
  "position",
  "created_at",
  "updated_at",
  "priority",
  "due_date",
  "relevance",
]);
export const SORT_ORDERS = Object.freeze(["asc", "desc"]);
export const LABEL_MATCH_MODES = Object.freeze(["any", "all"]);

const MIN_POSITION_GAP = 1e-6;
const POSITION_STEP = 1024;

const TRACKED_DIFF_FIELDS = [
  { field: "status", action: "status_changed" },
  { field: "priority", action: "priority_changed" },
  { field: "type", action: "type_changed" },
  { field: "severity", action: "severity_changed" },
  { field: "assignee_id", action: "assignee_changed" },
  { field: "story_points", action: "story_points_changed" },
  { field: "due_date", action: "due_date_changed" },
  { field: "title", action: "title_updated" },
];

const parse_csv_list = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? [...new Set(items)] : null;
};

const normalize_comparable_value = (field, value) => {
  if (value === undefined || value === null) return null;
  if (field === "due_date") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  }
  return value;
};

const ensure_assignee_is_member = async (project_id, assignee_id, db_client) => {
  if (!assignee_id) {
    return;
  }
  const member = await find_project_member(project_id, assignee_id, db_client);
  if (!member) {
    throw ApiError.bad_request(
      "Assignee must be an active member of this project.",
      [],
      "INVALID_ASSIGNEE"
    );
  }
};

const ensure_labels_belong_to_project = async (
  project_id,
  label_ids,
  db_client
) => {
  if (!label_ids || label_ids.length === 0) {
    return [];
  }
  const unique_ids = [...new Set(label_ids)];
  const found_labels = await find_labels_by_ids(
    project_id,
    unique_ids,
    db_client
  );
  if (found_labels.length !== unique_ids.length) {
    throw ApiError.bad_request(
      "One or more labels do not belong to this project.",
      [],
      "INVALID_LABEL_IDS"
    );
  }
  return unique_ids;
};

export const create_new_issue = async (project, reporter_id, payload) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot create issues in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  return with_transaction(async (client) => {
    await ensure_assignee_is_member(project.id, payload.assignee_id, client);
    const unique_label_ids = await ensure_labels_belong_to_project(
      project.id,
      payload.label_ids,
      client
    );

    const counter_row = await increment_project_issue_counter(
      project.id,
      client
    );
    if (!counter_row) {
      throw ApiError.not_found("Project not found.", "PROJECT_NOT_FOUND");
    }
    if (counter_row.is_archived) {
      throw ApiError.bad_request(
        "Cannot create issues in an archived project.",
        [],
        "PROJECT_ARCHIVED"
      );
    }

    const target_status = payload.status || "todo";
    const max_pos = await get_max_column_position(
      project.id,
      target_status,
      client
    );

    const issue_number = counter_row.issue_counter;
    const issue_key = `${counter_row.key_prefix}-${issue_number}`;

    const created = await create_issue(
      {
        project_id: project.id,
        issue_number,
        issue_key,
        title: payload.title,
        description: payload.description ?? null,
        reproduction_steps: payload.reproduction_steps ?? null,
        type: payload.type || "task",
        status: target_status,
        priority: payload.priority || "medium",
        severity: payload.severity ?? null,
        story_points: payload.story_points ?? null,
        due_date: payload.due_date ?? null,
        position: max_pos + POSITION_STEP,
        reporter_id,
        assignee_id: payload.assignee_id ?? null,
      },
      client
    );

    if (unique_label_ids.length > 0) {
      await replace_issue_labels(created.id, unique_label_ids, client);
    }

    await log_issue_activity(
      {
        issue_id: created.id,
        actor_id: reporter_id,
        action: "issue_created",
        metadata: {
          issue_key,
          type: payload.type || "task",
          status: target_status,
          priority: payload.priority || "medium",
          assignee_id: payload.assignee_id ?? null,
        },
      },
      client
    );

    return find_issue_by_id(created.id, project.id, client);
  });
};

export const get_project_issues = async (
  project_id,
  current_user_id,
  filters
) => {
  const safe_page = Math.max(1, filters.page || 1);
  const safe_limit = Math.min(200, Math.max(1, filters.limit || 50));
  const offset = (safe_page - 1) * safe_limit;

  let resolved_assignee_id = null;
  let unassigned_only = false;

  if (filters.assignee_id === "unassigned") {
    unassigned_only = true;
  } else if (filters.assignee_id === "me") {
    resolved_assignee_id = current_user_id;
  } else if (filters.assignee_id) {
    resolved_assignee_id = filters.assignee_id;
  }

  let resolved_reporter_id = null;
  if (filters.reporter_id === "me") {
    resolved_reporter_id = current_user_id;
  } else if (filters.reporter_id) {
    resolved_reporter_id = filters.reporter_id;
  }

  const parsed_label_ids = parse_csv_list(filters.label_ids);

  const { issues, total } = await list_project_issues(project_id, {
    statuses: parse_csv_list(filters.status),
    priorities: parse_csv_list(filters.priority),
    types: parse_csv_list(filters.type),
    severities: parse_csv_list(filters.severity),
    assignee_id: resolved_assignee_id,
    unassigned_only,
    reporter_id: resolved_reporter_id,
    label_ids: parsed_label_ids,
    label_match: filters.label_match || "any",
    due_before: filters.due_before || null,
    due_after: filters.due_after || null,
    overdue: Boolean(filters.overdue),
    search_query: filters.q ? filters.q.trim() : null,
    sort_by: filters.sort_by,
    sort_order: filters.sort_order || "asc",
    limit: safe_limit,
    offset,
  });

  return {
    issues,
    meta: {
      page: safe_page,
      limit: safe_limit,
      total,
      total_pages: Math.ceil(total / safe_limit) || 1,
    },
  };
};

export const get_issue_details = async (project_id, issue_id) => {
  const issue = await find_issue_by_id(issue_id, project_id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }
  return issue;
};

export const get_issue_details_by_key = async (project_id, raw_key) => {
  const issue = await find_issue_by_key(raw_key.toUpperCase(), project_id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }
  return issue;
};

export const update_issue_details = async (
  project,
  issue_id,
  actor_id,
  payload
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot update issues in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  return with_transaction(async (client) => {
    const existing = await find_issue_by_id(issue_id, project.id, client);
    if (!existing) {
      throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
    }

    if (payload.assignee_id !== undefined && payload.assignee_id !== null) {
      await ensure_assignee_is_member(project.id, payload.assignee_id, client);
    }

    let unique_label_ids;
    if (payload.label_ids !== undefined) {
      unique_label_ids = await ensure_labels_belong_to_project(
        project.id,
        payload.label_ids,
        client
      );
    }

    const updates = {};
    const scalar_fields = [
      "title",
      "description",
      "reproduction_steps",
      "type",
      "status",
      "priority",
      "severity",
      "story_points",
      "due_date",
      "assignee_id",
    ];

    for (const field of scalar_fields) {
      if (payload[field] !== undefined) {
        updates[field] = payload[field] === "" ? null : payload[field];
      }
    }

    if (updates.status && updates.status !== existing.status) {
      const max_pos = await get_max_column_position(
        project.id,
        updates.status,
        client
      );
      updates.position = max_pos + POSITION_STEP;
    }

    if (
      Object.keys(updates).length === 0 &&
      unique_label_ids === undefined
    ) {
      throw ApiError.bad_request(
        "Provide at least one field to update.",
        [],
        "EMPTY_UPDATE_PAYLOAD"
      );
    }

    const activities = [];

    for (const { field, action } of TRACKED_DIFF_FIELDS) {
      if (updates[field] !== undefined) {
        const old_val = normalize_comparable_value(field, existing[field]);
        const new_val = normalize_comparable_value(field, updates[field]);
        if (old_val !== new_val) {
          activities.push({
            issue_id,
            actor_id,
            action,
            metadata: {
              field,
              old_value: old_val,
              new_value: new_val,
            },
          });
        }
      }
    }

    if (
      updates.description !== undefined &&
      updates.description !== existing.description
    ) {
      activities.push({
        issue_id,
        actor_id,
        action: "description_updated",
        metadata: { field: "description" },
      });
    }

    if (
      updates.reproduction_steps !== undefined &&
      updates.reproduction_steps !== existing.reproduction_steps
    ) {
      activities.push({
        issue_id,
        actor_id,
        action: "reproduction_steps_updated",
        metadata: { field: "reproduction_steps" },
      });
    }

    if (unique_label_ids !== undefined) {
      const old_label_ids = (existing.labels || []).map((l) => l.id).sort();
      const new_label_ids = [...unique_label_ids].sort();
      if (JSON.stringify(old_label_ids) !== JSON.stringify(new_label_ids)) {
        activities.push({
          issue_id,
          actor_id,
          action: "labels_updated",
          metadata: {
            old_label_ids,
            new_label_ids,
          },
        });
      }
      await replace_issue_labels(issue_id, unique_label_ids, client);
    }

    const updated_issue = await update_issue(
      issue_id,
      project.id,
      updates,
      client
    );

    if (activities.length > 0) {
      await log_issue_activities_bulk(activities, client);
    }

    return updated_issue;
  });
};

const compute_kanban_position = async (
  project_id,
  target_status,
  issue_id,
  prev_position,
  next_position,
  client
) => {
  const has_prev = prev_position !== undefined && prev_position !== null;
  const has_next = next_position !== undefined && next_position !== null;

  if (has_prev && has_next) {
    if (prev_position > next_position) {
      throw ApiError.bad_request(
        "prev_position cannot be greater than next_position.",
        [],
        "INVALID_KANBAN_POSITION"
      );
    }

    if (next_position - prev_position > MIN_POSITION_GAP) {
      return (prev_position + next_position) / 2;
    }

    await rebalance_column_positions(project_id, target_status, client);
    const column_items = await list_column_issue_positions(
      project_id,
      target_status,
      issue_id,
      client
    );
    if (column_items.length === 0) {
      return POSITION_STEP;
    }
    const after_idx = column_items.findIndex(
      (item) => Number(item.position) >= next_position
    );
    if (after_idx === 0) {
      return Number(column_items[0].position) / 2;
    }
    if (after_idx === -1) {
      return Number(column_items[column_items.length - 1].position) + POSITION_STEP;
    }
    return (
      (Number(column_items[after_idx - 1].position) +
        Number(column_items[after_idx].position)) /
      2
    );
  }

  if (has_prev && !has_next) {
    return prev_position + POSITION_STEP;
  }

  if (!has_prev && has_next) {
    if (next_position > MIN_POSITION_GAP * 2) {
      return next_position / 2;
    }
    await rebalance_column_positions(project_id, target_status, client);
    const column_items = await list_column_issue_positions(
      project_id,
      target_status,
      issue_id,
      client
    );
    if (column_items.length === 0) {
      return POSITION_STEP;
    }
    return Number(column_items[0].position) / 2;
  }

  const max_pos = await get_max_column_position(
    project_id,
    target_status,
    client
  );
  return max_pos + POSITION_STEP;
};

export const move_kanban_issue = async (
  project,
  issue_id,
  actor_id,
  { status, prev_position = null, next_position = null }
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot move issues in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  return with_transaction(async (client) => {
    const existing = await find_issue_by_id(issue_id, project.id, client);
    if (!existing) {
      throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
    }

    const new_position = await compute_kanban_position(
      project.id,
      status,
      issue_id,
      prev_position,
      next_position,
      client
    );

    const moved_issue = await update_issue(
      issue_id,
      project.id,
      {
        status,
        position: new_position,
      },
      client
    );

    if (existing.status !== status) {
      await log_issue_activity(
        {
          issue_id,
          actor_id,
          action: "status_changed",
          metadata: {
            field: "status",
            old_value: existing.status,
            new_value: status,
          },
        },
        client
      );
    }

    return moved_issue;
  });
};

export const delete_existing_issue = async (
  project,
  acting_member,
  issue_id
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot delete issues in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  return with_transaction(async (client) => {
    const existing = await find_issue_by_id(issue_id, project.id, client);
    if (!existing) {
      throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
    }

    const is_privileged = ["admin", "manager"].includes(acting_member.role);
    const is_developer_owner =
      acting_member.role === "developer" &&
      existing.reporter_id === acting_member.user_id;

    if (!is_privileged && !is_developer_owner) {
      throw ApiError.forbidden(
        "Only admins, managers, or the developer who reported this issue can delete it.",
        "INSUFFICIENT_DELETE_PERMISSION"
      );
    }

    return delete_issue(issue_id, project.id, client);
  });
};

export const add_label_to_issue = async (
  project,
  issue_id,
  label_id,
  actor_id
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot modify issues in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  const [issue, label] = await Promise.all([
    find_issue_by_id(issue_id, project.id),
    find_label_by_id(label_id, project.id),
  ]);

  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }
  if (!label) {
    throw ApiError.not_found("Label not found in this project.", "LABEL_NOT_FOUND");
  }

  const already_attached = (issue.labels || []).some((l) => l.id === label_id);
  await attach_label_to_issue(issue_id, label_id);

  if (!already_attached) {
    await log_issue_activity({
      issue_id,
      actor_id,
      action: "label_added",
      metadata: {
        label_id: label.id,
        label_name: label.name,
      },
    });
  }

  return find_issue_by_id(issue_id, project.id);
};

export const remove_label_from_issue = async (
  project,
  issue_id,
  label_id,
  actor_id
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot modify issues in an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  const issue = await find_issue_by_id(issue_id, project.id);
  if (!issue) {
    throw ApiError.not_found("Issue not found.", "ISSUE_NOT_FOUND");
  }

  const removed_label = (issue.labels || []).find((l) => l.id === label_id);
  const detached = await detach_label_from_issue(issue_id, label_id);

  if (detached && removed_label) {
    await log_issue_activity({
      issue_id,
      actor_id,
      action: "label_removed",
      metadata: {
        label_id: removed_label.id,
        label_name: removed_label.name,
      },
    });
  }

  return find_issue_by_id(issue_id, project.id);
};