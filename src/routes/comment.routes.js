import express from "express";
import { validate_request } from "../middleware/validate.middleware.js";
import { authorize_project_role } from "../middleware/project_rbac.middleware.js";
import {
  list_comments,
  create_comment,
  update_comment,
  delete_comment,
} from "../controllers/comment.controller.js";

const router = express.Router({ mergeParams: true });

const list_comments_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
  },
  query: {
    parent_comment_id: { required: false, type: "uuid" },
    top_level_only: { required: false, type: "boolean" },
    page: { required: false, type: "number", min: 1 },
    limit: { required: false, type: "number", min: 1, max: 200 },
  },
};

const create_comment_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
  },
  body: {
    body: { required: true, type: "string", trim: true, min: 1, max: 10000 },
    parent_comment_id: { required: false, type: "uuid" },
  },
};

const update_comment_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
    commentId: { required: true, type: "uuid" },
  },
  body: {
    body: { required: true, type: "string", trim: true, min: 1, max: 10000 },
  },
};

const delete_comment_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
    commentId: { required: true, type: "uuid" },
  },
};

// All project members (including viewers) can read and post comments
router.get(
  "/",
  validate_request(list_comments_schema),
  authorize_project_role(),
  list_comments
);

router.post(
  "/",
  validate_request(create_comment_schema),
  authorize_project_role(),
  create_comment
);

// Author-only edit; Author or project Admin delete (enforced in service)
router.patch(
  "/:commentId",
  validate_request(update_comment_schema),
  authorize_project_role(),
  update_comment
);

router.delete(
  "/:commentId",
  validate_request(delete_comment_schema),
  authorize_project_role(),
  delete_comment
);

export default router;