import { eventType, Inngest } from "inngest";
import { z } from "zod";

export const reminderSendEvent = eventType("notification.send", {
  schema: z.object({
    userId: z.string().min(1),
    date: z.iso.date(),
    hour: z.union([z.literal(21), z.literal(22), z.literal(23)]),
  }),
});

export const inngest = new Inngest({ id: "routine-tracker" });
