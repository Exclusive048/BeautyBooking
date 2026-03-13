import { jsonFail } from "@/lib/api/contracts";
import { withRequestContext } from "@/lib/api/with-request-context";
import { getSessionUser } from "@/lib/auth/session";
import { logError } from "@/lib/logging/logger";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { notificationsNotifier } from "@/lib/notifications/notifier";
import type { NotificationEvent } from "@/lib/notifications/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const REPLAY_LIMIT = 20;

function toNotificationEvent(input: {
  id: string;
  type: NotificationEvent["type"];
  title: string;
  body: string;
  payloadJson: NotificationEvent["payloadJson"];
  createdAt: Date;
}): NotificationEvent {
  return {
    id: input.id,
    type: input.type,
    title: input.title,
    body: input.body,
    payloadJson: input.payloadJson,
    createdAt: input.createdAt.toISOString(),
  };
}

async function loadMissedEvents(userId: string, lastEventId: string): Promise<NotificationEvent[]> {
  const replayFrom = new Date(Date.now() - REPLAY_WINDOW_MS);
  const lastSeen = await prisma.notification.findFirst({
    where: { id: lastEventId, userId },
    select: { id: true, createdAt: true },
  });

  const where = lastSeen
    ? {
        userId,
        createdAt: { gte: lastSeen.createdAt > replayFrom ? lastSeen.createdAt : replayFrom },
        OR: [
          { createdAt: { gt: lastSeen.createdAt } },
          { createdAt: lastSeen.createdAt, id: { gt: lastSeen.id } },
        ],
      }
    : {
        userId,
        createdAt: { gte: replayFrom },
      };

  const rows = await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: REPLAY_LIMIT,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      payloadJson: true,
      createdAt: true,
    },
  });

  return rows.map(toNotificationEvent);
}

export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    const user = await getSessionUser();
    if (!user) {
      void recordSurfaceEvent({
        surface: "notifications",
        outcome: "denied",
        operation: "stream-connect",
        code: "UNAUTHORIZED",
      });
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const lastEventId = req.headers.get("last-event-id")?.trim() ?? "";
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    let isClosed = false;

    const send = (payload: unknown, eventId?: string) => {
      const prefix = eventId ? `id: ${eventId}\n` : "";
      void writer.write(encoder.encode(`${prefix}data: ${JSON.stringify(payload)}\n\n`));
    };

    if (lastEventId) {
      try {
        const missed = await loadMissedEvents(user.id, lastEventId);
        for (const event of missed) {
          send(event, event.id);
        }
      } catch (error) {
        logError("Failed to replay missed notification events", {
          userId: user.id,
          lastEventId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let notifier: Awaited<typeof notificationsNotifier>;
    try {
      notifier = await notificationsNotifier;
    } catch {
      void recordSurfaceEvent({
        surface: "notifications",
        outcome: "failure",
        operation: "stream-connect",
        code: "NOTIFIER_UNAVAILABLE",
      });
      return jsonFail(503, "Service unavailable", "INTERNAL_ERROR");
    }
    const unsubscribe = notifier.subscribe(user.id, (event) => {
      send(event, event.id);
    });

    const heartbeat = setInterval(() => {
      void writer.write(encoder.encode(": ping\n\n"));
    }, 20000);

    const close = () => {
      if (isClosed) return;
      isClosed = true;
      clearInterval(heartbeat);
      unsubscribe();
      req.signal.removeEventListener("abort", close);
      void writer.close().catch(() => undefined);
    };

    req.signal.addEventListener("abort", close);
    void recordSurfaceEvent({
      surface: "notifications",
      outcome: "success",
      operation: "stream-connect",
    });

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  });
}
