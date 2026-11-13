import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";
import { get_issue_activity_log } from "../services/activity.service.js";

export const list_activity = async_handler(async (req, res) => {
  const { sort_order = "desc", page = 1, limit = 50 } = req.query;
  const result = await get_issue_activity_log(
    req.params.projectId,
    req.params.issueId,
    { sort_order, page, limit }
  );

  return send_success(
    res,
    200,
    "Issue activity log fetched successfully.",
    result.activities,
    result.meta
  );
});