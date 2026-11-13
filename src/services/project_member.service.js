import crypto from "node:crypto";
import { env } from "../config/env.config.js";
import { with_transaction } from "../config/db.js";
import { ApiError } from "../utils/api_error.util.js";
import { find_user_by_email } from "../models/user.model.js";
import {
  add_project_member,
  find_project_member,
  list_project_members,
  lock_and_count_project_admins,
  update_project_member_role,
  remove_project_member,
} from "../models/project_member.model.js";
import {
  create_project_invite,
  find_invite_by_token_hash,
  list_pending_invites,
  mark_invite_accepted,
  delete_invite,
} from "../models/project_invite.model.js";

const hash_invite_token = (raw_token) => {
  return crypto.createHash("sha256").update(raw_token).digest("hex");
};

export const create_invite = async (
  project,
  invited_by_user_id,
  { email = null, role }
) => {
  if (project.is_archived) {
    throw ApiError.bad_request(
      "Cannot invite members to an archived project.",
      [],
      "PROJECT_ARCHIVED"
    );
  }

  const normalized_email = email ? email.toLowerCase() : null;

  if (normalized_email) {
    const existing_user = await find_user_by_email(normalized_email);
    if (existing_user) {
      const existing_member = await find_project_member(
        project.id,
        existing_user.id
      );
      if (existing_member) {
        throw ApiError.conflict(
          "This user is already a member of the project.",
          "ALREADY_PROJECT_MEMBER"
        );
      }
    }
  }

  const raw_token = crypto.randomBytes(32).toString("hex");
  const token_hash = hash_invite_token(raw_token);
  const expires_at = new Date(
    Date.now() + env.invite_expires_hours * 60 * 60 * 1000
  );

  const invite = await create_project_invite({
    project_id: project.id,
    email: normalized_email,
    role,
    token_hash,
    invited_by: invited_by_user_id,
    expires_at,
  });

  return {
    invite,
    invite_token: raw_token,
  };
};

export const get_pending_invites = async (project_id) => {
  return list_pending_invites(project_id);
};

export const revoke_pending_invite = async (project_id, invite_id) => {
  const deleted = await delete_invite(invite_id, project_id);
  if (!deleted) {
    throw ApiError.not_found(
      "Pending invite not found.",
      "INVITE_NOT_FOUND"
    );
  }
};

export const accept_project_invite = async (raw_token, user) => {
  const token_hash = hash_invite_token(raw_token);

  return with_transaction(async (client) => {
    const invite = await find_invite_by_token_hash(token_hash, client);

    if (!invite) {
      throw ApiError.not_found("Invite link is invalid.", "INVITE_NOT_FOUND");
    }

    if (invite.accepted_at) {
      throw ApiError.bad_request(
        "This invite has already been used.",
        [],
        "INVITE_ALREADY_ACCEPTED"
      );
    }

    if (new Date(invite.expires_at) <= new Date()) {
      throw ApiError.bad_request(
        "This invite has expired.",
        [],
        "INVITE_EXPIRED"
      );
    }

    if (invite.is_archived) {
      throw ApiError.bad_request(
        "Cannot join an archived project.",
        [],
        "PROJECT_ARCHIVED"
      );
    }

    if (
      invite.email &&
      invite.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      throw ApiError.forbidden(
        "This invite was issued to a different email address.",
        "INVITE_EMAIL_MISMATCH"
      );
    }

    const existing_member = await find_project_member(
      invite.project_id,
      user.id,
      client
    );

    if (existing_member) {
      throw ApiError.conflict(
        "You are already a member of this project.",
        "ALREADY_PROJECT_MEMBER"
      );
    }

    const membership = await add_project_member(
      {
        project_id: invite.project_id,
        user_id: user.id,
        role: invite.role,
      },
      client
    );

    await mark_invite_accepted(invite.id, client);

    return {
      project: {
        id: invite.project_id,
        name: invite.project_name,
        key_prefix: invite.key_prefix,
      },
      membership,
    };
  });
};

export const get_project_members = async (project_id) => {
  return list_project_members(project_id);
};

export const change_member_role = async (
  project_id,
  target_user_id,
  new_role
) => {
  return with_transaction(async (client) => {
    const target_member = await find_project_member(
      project_id,
      target_user_id,
      client
    );

    if (!target_member) {
      throw ApiError.not_found(
        "Project member not found.",
        "PROJECT_MEMBER_NOT_FOUND"
      );
    }

    if (target_member.role === new_role) {
      return target_member;
    }

    if (target_member.role === "admin" && new_role !== "admin") {
      const admins = await lock_and_count_project_admins(project_id, client);
      if (admins.length <= 1) {
        throw ApiError.bad_request(
          "Cannot demote the last admin of the project.",
          [],
          "LAST_ADMIN_PROTECTION"
        );
      }
    }

    return update_project_member_role(
      project_id,
      target_user_id,
      new_role,
      client
    );
  });
};

export const remove_member_from_project = async (
  project_id,
  acting_member,
  target_user_id
) => {
  const is_self = acting_member.user_id === target_user_id;
  const is_admin = acting_member.role === "admin";

  if (!is_admin && !is_self) {
    throw ApiError.forbidden(
      "Only project admins can remove other members.",
      "INSUFFICIENT_PROJECT_ROLE"
    );
  }

  return with_transaction(async (client) => {
    const target_member = await find_project_member(
      project_id,
      target_user_id,
      client
    );

    if (!target_member) {
      throw ApiError.not_found(
        "Project member not found.",
        "PROJECT_MEMBER_NOT_FOUND"
      );
    }

    if (target_member.role === "admin") {
      const admins = await lock_and_count_project_admins(project_id, client);
      if (admins.length <= 1) {
        throw ApiError.bad_request(
          "Cannot remove the last admin from the project.",
          [],
          "LAST_ADMIN_PROTECTION"
        );
      }
    }

    return remove_project_member(project_id, target_user_id, client);
  });
};