import { getSessionUser } from "@/lib/auth/session";
import { notificationsNotifier } from "@/lib/notifications/notifier";
import { jsonFail } from "@/lib/api/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const send = (payload: unknown) => {
    void writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  const unsubscribe = notificationsNotifier.subscribe(user.id, (event) => {
    send(event);
  });

  const heartbeat = setInterval(() => {
    void writer.write(encoder.encode(": ping\n\n"));
  }, 20000);

  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
    void writer.close();
  };

  req.signal.addEventListener("abort", close);

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
