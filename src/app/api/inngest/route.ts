import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { scheduleTaskReminders, sendTaskReminder } from "../../../inngest/functions";

// Export the raw handler without wrapping it in your custom API/Auth wrappers
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scheduleTaskReminders,
    sendTaskReminder
  ],
});
