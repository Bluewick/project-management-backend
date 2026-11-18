import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./env.config.js";
import { find_project_membership_with_project } from "../models/project_member.model.js";
import { find_issue_by_id } from "../models/issue.model.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let io_instance = null;

export const get_project_room = (project_id) => `project:${project_id}`;
export const get_issue_room = (issue_id) => `issue:${issue_id}`;

const extract_socket_token = (socket) => {
  const auth_token = socket.handshake.auth?.token;
  if (typeof auth_token === "string" && auth_token.trim()) {
    return auth_token.replace(/^Bearer\s+/i, "").trim();
  }

  const header = socket.handshake.headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.split(" ")[1]?.trim() || null;
  }

  return null;
};

const safe_ack = (ack, response) => {
  if (typeof ack === "function") {
    ack(response);
  }
};

export const init_socket_server = (http_server) => {
  if (!env.enable_socket_io) {
    return null;
  }

  const io = new Server(http_server, {
    cors: {
      origin: env.client_origin,
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // Authenticate WebSocket connection using the same JWT secret
  io.use((socket, next) => {
    try {
      const token = extract_socket_token(socket);
      if (!token) {
        return next(new Error("Authentication token missing."));
      }
      const decoded = jwt.verify(token, env.jwt_secret);
      socket.user = decoded;
      return next();
    } catch {
      return next(new Error("Invalid or expired authentication token."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("project:join", async (payload, ack) => {
      try {
        const project_id =
          typeof payload === "string" ? payload : payload?.project_id;

        if (!project_id || !UUID_REGEX.test(project_id)) {
          return safe_ack(ack, {
            ok: false,
            error: "Valid project_id UUID is required.",
          });
        }

        const membership = await find_project_membership_with_project(
          project_id,
          socket.user.id
        );

        if (!membership || !membership.member_id) {
          return safe_ack(ack, {
            ok: false,
            error: "Forbidden: Not a member of this project.",
          });
        }

        const room = get_project_room(project_id);
        await socket.join(room);

        return safe_ack(ack, { ok: true, room });
      } catch {
        return safe_ack(ack, {
          ok: false,
          error: "Failed to join project room.",
        });
      }
    });

    socket.on("project:leave", async (payload, ack) => {
      const project_id =
        typeof payload === "string" ? payload : payload?.project_id;
      if (project_id && UUID_REGEX.test(project_id)) {
        await socket.leave(get_project_room(project_id));
      }
      return safe_ack(ack, { ok: true });
    });

    socket.on("issue:join", async (payload, ack) => {
      try {
        const project_id = payload?.project_id;
        const issue_id = payload?.issue_id;

        if (
          !project_id ||
          !issue_id ||
          !UUID_REGEX.test(project_id) ||
          !UUID_REGEX.test(issue_id)
        ) {
          return safe_ack(ack, {
            ok: false,
            error: "Valid project_id and issue_id UUIDs are required.",
          });
        }

        const membership = await find_project_membership_with_project(
          project_id,
          socket.user.id
        );

        if (!membership || !membership.member_id) {
          return safe_ack(ack, {
            ok: false,
            error: "Forbidden: Not a member of this project.",
          });
        }

        const issue = await find_issue_by_id(issue_id, project_id);
        if (!issue) {
          return safe_ack(ack, {
            ok: false,
            error: "Issue not found in this project.",
          });
        }

        const room = get_issue_room(issue_id);
        await socket.join(room);

        return safe_ack(ack, { ok: true, room });
      } catch {
        return safe_ack(ack, {
          ok: false,
          error: "Failed to join issue room.",
        });
      }
    });

    socket.on("issue:leave", async (payload, ack) => {
      const issue_id =
        typeof payload === "string" ? payload : payload?.issue_id;
      if (issue_id && UUID_REGEX.test(issue_id)) {
        await socket.leave(get_issue_room(issue_id));
      }
      return safe_ack(ack, { ok: true });
    });
  });

  io_instance = io;
  return io_instance;
};

export const get_io = () => io_instance;

export const emit_to_rooms = (rooms, event_name, payload) => {
  if (!io_instance || !rooms || rooms.length === 0) {
    return;
  }
  io_instance.to(rooms).emit(event_name, payload);
};

export const emit_to_project = (project_id, event_name, payload) => {
  emit_to_rooms([get_project_room(project_id)], event_name, payload);
};

export const emit_to_issue = (issue_id, event_name, payload) => {
  emit_to_rooms([get_issue_room(issue_id)], event_name, payload);
};

export const close_socket_server = async () => {
  if (!io_instance) {
    return;
  }
  const current = io_instance;
  io_instance = null;
  await new Promise((resolve) => {
    current.close(() => resolve());
  });
};