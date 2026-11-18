import { env } from "../config/env.config.js";
import { delete_s3_object } from "../config/s3.config.js";
import {
  delete_expired_refresh_tokens,
  delete_expired_project_invites,
  find_stale_pending_attachments,
  delete_attachments_by_ids,
} from "../models/cleanup.model.js";

let is_cleanup_running = false;
let cleanup_timer = null;

const is_s3_configured = () => {
  return Boolean(
    env.aws_region &&
      env.aws_s3_bucket &&
      env.aws_access_key_id &&
      env.aws_secret_access_key
  );
};

export const run_maintenance_cleanup = async () => {
  if (is_cleanup_running) {
    return null;
  }

  is_cleanup_running = true;

  try {
    const [removed_tokens, removed_invites, stale_attachments] =
      await Promise.all([
        delete_expired_refresh_tokens(),
        delete_expired_project_invites(),
        find_stale_pending_attachments(24, 100),
      ]);

    let removed_attachments = 0;

    if (stale_attachments.length > 0) {
      if (is_s3_configured()) {
        await Promise.allSettled(
          stale_attachments.map((item) => delete_s3_object(item.s3_key))
        );
      }

      removed_attachments = await delete_attachments_by_ids(
        stale_attachments.map((item) => item.id)
      );
    }

    const summary = {
      removed_tokens,
      removed_invites,
      removed_attachments,
    };

    if (
      removed_tokens > 0 ||
      removed_invites > 0 ||
      removed_attachments > 0
    ) {
      console.log("[Maintenance Cleanup]", summary);
    }

    return summary;
  } catch (error) {
    console.error("[Maintenance Cleanup Error]:", error.message);
    return null;
  } finally {
    is_cleanup_running = false;
  }
};

export const start_cleanup_scheduler = () => {
  if (cleanup_timer || env.cleanup_interval_ms <= 0) {
    return;
  }

  cleanup_timer = setInterval(() => {
    void run_maintenance_cleanup();
  }, env.cleanup_interval_ms);

  // Allow Node process to exit cleanly if timer is the only active handle
  if (typeof cleanup_timer.unref === "function") {
    cleanup_timer.unref();
  }
};

export const stop_cleanup_scheduler = () => {
  if (cleanup_timer) {
    clearInterval(cleanup_timer);
    cleanup_timer = null;
  }
};