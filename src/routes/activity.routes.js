import express from "express";
import { validate_request } from "../middleware/validate.middleware.js";
import { authorize_project_role } from "../middleware/project_rbac.middleware.js";
import { list_activity } from "../controllers/activity.controller.js";

const router = express.Router({ mergeParams: true });

const list_activity_schema = {
  params: {
    projectId: { required: true, type: "uuid" },
    issueId: { required: true, type: "uuid" },
  },
  query: {
    sort_order: { required: false, type: "string", enum: ["asc", "desc"] },
    page: { required: false, type: "number", min: 1 },
    limit: { required: false, type: "number", min: 1, max: 200 },
  },
};

router.get(
  "/",
  validate_request(list_activity_schema),
  authorize_project_role(),
  list_activity
);

export default router;