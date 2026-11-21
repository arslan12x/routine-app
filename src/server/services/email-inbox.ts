import { ImapFlow } from "imapflow";
import { withUserDb, systemDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { matchRecruiterReply, type IncomingEmailHeader } from "@/lib/domain/email-config";
import { type DirectEmailMetadata } from "./email-transport";
import type { Prisma } from "@/generated/prisma/client";

export interface SyncRecruiterRepliesResult {
  checkedCount: number;
  repliesFound: number;
  updatedApplicationIds: string[];
  error?: string;
}

const ACTIVE_FOLLOW_UP_STAGES = [
  "WAITING_FU1",
  "FOLLOW_UP_1",
  "WAITING_FU2",
  "FOLLOW_UP_2",
  "WAITING_FU3",
  "FOLLOW_UP_3",
];

/**
 * Connects to the user's IMAP server, inspects INBOX messages since lastSyncedAt,
 * matches recruiter replies to active job applications, and automatically short-circuits
 * pipeline stages to "REPLIED".
 */
export async function syncRecruiterRepliesForUser(
  userId: string,
  useSystemDb = false
): Promise<SyncRecruiterRepliesResult> {
  // 1. Load user's DIRECT_EMAIL integration
  const integration = useSystemDb
    ? await systemDb.userIntegration.findUnique({
        where: { userId_provider: { userId, provider: "DIRECT_EMAIL" } },
      })
    : await withUserDb(userId, (tx) =>
        tx.userIntegration.findUnique({
          where: { userId_provider: { userId, provider: "DIRECT_EMAIL" } },
        })
      );

  const meta = integration?.metadata as DirectEmailMetadata | null;
  if (!integration || !meta?.encryptedPassword || !meta.imapHost) {
    return {
      checkedCount: 0,
      repliesFound: 0,
      updatedApplicationIds: [],
    };
  }

  // 2. Load active job applications in follow-up stages
  const activeApplications = useSystemDb
    ? await systemDb.jobApplication.findMany({
        where: {
          userId,
          stage: { in: ACTIVE_FOLLOW_UP_STAGES },
        },
        include: { company: true },
      })
    : await withUserDb(userId, (tx) =>
        tx.jobApplication.findMany({
          where: {
            userId,
            stage: { in: ACTIVE_FOLLOW_UP_STAGES },
          },
          include: { company: true },
        })
      );

  if (activeApplications.length === 0) {
    return {
      checkedCount: 0,
      repliesFound: 0,
      updatedApplicationIds: [],
    };
  }

  let decryptedPassword = "";
  try {
    decryptedPassword = decryptSecret(meta.encryptedPassword);
  } catch (err) {
    console.warn(`[IMAP Sync] Failed to decrypt password for user ${userId}`, err);
    return {
      checkedCount: 0,
      repliesFound: 0,
      updatedApplicationIds: [],
      error: "Failed to decrypt email credentials",
    };
  }

  const client = new ImapFlow({
    host: meta.imapHost,
    port: meta.imapPort,
    secure: meta.imapSecure,
    auth: {
      user: integration.externalUsername,
      pass: decryptedPassword,
    },
    logger: false,
    connectionTimeout: 15000,
  });

  const updatedApplicationIds: string[] = [];
  let checkedCount = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });

    try {
      // Look back to last sync or up to 14 days ago
      const sinceDate = integration.lastSyncedAt
        ? new Date(integration.lastSyncedAt)
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const searchResult = await client.search({ since: sinceDate });
      const seqList = Array.isArray(searchResult) ? searchResult : [];
      checkedCount = seqList.length;

      if (seqList.length > 0) {
        // Query headers and envelope for each message
        const remainingApps = [...activeApplications];

        for await (const message of client.fetch(seqList.join(","), {
          envelope: true,
          headers: ["references", "in-reply-to"],
        })) {
          if (!message.envelope) continue;

          // Parse sender address
          const fromAddress =
            message.envelope.from?.[0]?.address ||
            message.envelope.from?.[0]?.name ||
            "";

          // Parse references header if available
          let referencesText = "";
          if (message.headers) {
            const rawHeaders = message.headers.toString();
            const refMatch = rawHeaders.match(/references:\s*(.+)/i);
            if (refMatch && refMatch[1]) {
              referencesText = refMatch[1].trim();
            }
          }

          const incomingHeader: IncomingEmailHeader = {
            from: fromAddress,
            subject: message.envelope.subject,
            inReplyTo: message.envelope.inReplyTo,
            references: referencesText,
            date: message.envelope.date || new Date(),
            messageId: message.envelope.messageId,
          };

          // Compare against all active applications
          for (let i = remainingApps.length - 1; i >= 0; i--) {
            const app = remainingApps[i];
            const isMatch = matchRecruiterReply(
              incomingHeader,
              {
                id: app.id,
                hrEmail: app.hrEmail,
                emailThreadId: app.emailThreadId,
                jobTitle: app.jobTitle,
                companyName: app.company.name,
              },
              integration.externalUsername
            );

            if (isMatch) {
              const receivedAtStr = incomingHeader.date instanceof Date
                ? incomingHeader.date.toISOString()
                : String(incomingHeader.date || new Date().toISOString());

              const existingLogs = (app.logs as Array<Record<string, unknown>>) || [];
              const updatedLogs = [
                ...existingLogs,
                {
                  action: "HR_REPLY_DETECTED",
                  stage: "REPLIED",
                  recruiterEmail: fromAddress,
                  subject: incomingHeader.subject || "Re: Job Application",
                  receivedAt: receivedAtStr,
                  detectedVia: "IMAP_SYNC",
                  emailThreadId: incomingHeader.inReplyTo || incomingHeader.messageId || app.emailThreadId,
                },
              ];

              // Update application to REPLIED and clear nextActionAt
              if (useSystemDb) {
                await systemDb.jobApplication.update({
                  where: { id: app.id },
                  data: {
                    stage: "REPLIED",
                    nextActionAt: null,
                    logs: updatedLogs as Prisma.InputJsonValue,
                  },
                });
              } else {
                await withUserDb(userId, (tx) =>
                  tx.jobApplication.update({
                    where: { id: app.id },
                    data: {
                      stage: "REPLIED",
                      nextActionAt: null,
                      logs: updatedLogs as Prisma.InputJsonValue,
                    },
                  })
                );
              }

              updatedApplicationIds.push(app.id);
              remainingApps.splice(i, 1); // remove so we don't re-match
              console.log(
                `[IMAP Sync] Detected recruiter reply for app ${app.id} (${app.jobTitle} at ${app.company.name}) from ${fromAddress}`
              );
            }
          }
        }
      }
    } finally {
      lock.release();
    }

    // Update integration lastSyncedAt and status
    const now = new Date();
    if (useSystemDb) {
      await systemDb.userIntegration.update({
        where: { id: integration.id },
        data: {
          lastSyncedAt: now,
          lastStatus: "OK",
        },
      });
    } else {
      await withUserDb(userId, (tx) =>
        tx.userIntegration.update({
          where: { id: integration.id },
          data: {
            lastSyncedAt: now,
            lastStatus: "OK",
          },
        })
      );
    }

    return {
      checkedCount,
      repliesFound: updatedApplicationIds.length,
      updatedApplicationIds,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[IMAP Sync] Error syncing messages for user ${userId}:`, err);

    try {
      if (useSystemDb) {
        await systemDb.userIntegration.update({
          where: { id: integration.id },
          data: {
            lastStatus: `ERROR: ${errorMsg.slice(0, 100)}`,
          },
        });
      } else {
        await withUserDb(userId, (tx) =>
          tx.userIntegration.update({
            where: { id: integration.id },
            data: {
              lastStatus: `ERROR: ${errorMsg.slice(0, 100)}`,
            },
          })
        );
      }
    } catch {
      // Ignore secondary update error
    }

    return {
      checkedCount: 0,
      repliesFound: 0,
      updatedApplicationIds: [],
      error: errorMsg,
    };
  } finally {
    try {
      if (client.usable) {
        await client.logout();
      }
    } catch {
      // Ignore logout cleanup error
    }
  }
}
