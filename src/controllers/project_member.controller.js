import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import {
  create_invite,
  get_pending_invites,
  revoke_pending_invite,
  accept_project_invite,
  get_project_members,
  change_member_role,
  remove_member_from_project,
} from "../services/project_member.service.js";

export const invite_member = async_handler(async (req, res) => {
  const { email, role } = req.body;
  const result = await create_invite(req.project, req.user.id, {
    email,
    role,
  });

  return send_success(
    res,
    201,
    "Project invitation created successfully.",
    result
  );
});

export const list_invites = async_handler(async (req, res) => {
  const invites = await get_pending_invites(req.params.projectId);

  return send_success(
    res,
    200,
    "Pending invitations fetched successfully.",
    invites
  );
});

export const cancel_invite = async_handler(async (req, res) => {
  await revoke_pending_invite(req.params.projectId, req.params.inviteId);

  return send_success(res, 200, "Invitation revoked successfully.", null);
});

export const accept_invite = async_handler(async (req, res) => {
  const result = await accept_project_invite(req.params.token, req.user);

  return send_success(
    res,
    200,
    "Invitation accepted. You have joined the project.",
    result
  );
});

export const list_members = async_handler(async (req, res) => {
  const members = await get_project_members(req.params.projectId);

  return send_success(
    res,
    200,
    "Project members fetched successfully.",
    members
  );
});

export const update_member_role = async_handler(async (req, res) => {
  const updated = await change_member_role(
    req.params.projectId,
    req.params.userId,
    req.body.role
  );

  return send_success(
    res,
    200,
    "Member role updated successfully.",
    updated
  );
});

export const remove_member = async_handler(async (req, res) => {
  await remove_member_from_project(
    req.params.projectId,
    req.project_member,
    req.params.userId
  );

  return send_success(
    res,
    200,
    "Member removed from project successfully.",
    null
  );
});