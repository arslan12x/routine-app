import { timingSafeEqual } from "node:crypto";
import { ApiError, route } from "@/lib/api";
import { dispatchTaskReminders } from "@/server/services/reminders";

export const maxDuration = 60;

export const POST = route(async (req) => {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret) throw new ApiError(503, "NOT_CONFIGURED", "Reminder scheduler is not configured");
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid scheduler credentials");
  }
  return dispatchTaskReminders();
});
