import { test_db_connection } from "../config/db.js";
import { async_handler } from "../utils/async_handler.util.js";
import { send_success } from "../utils/response.util.js";

export const get_health_status = async_handler(async (req, res) => {
  const db_status = await test_db_connection();

  return send_success(res, 200, "Traceboard API is healthy.", {
    status: "ok",
    uptime_seconds: Math.floor(process.uptime()),
    database: {
      connected: true,
      server_time: db_status.server_time,
    },
  });
});