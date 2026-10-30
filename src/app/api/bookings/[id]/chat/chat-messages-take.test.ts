import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { CHAT_THREAD_PAGE_SIZE } from "@/lib/chat/conversation-window";

/**
 * CHAT-MESSAGES-TAKE — чат записи (`GET /api/bookings/[id]/chat`) читает
 * сообщения с потолком, а не всю историю.
 *
 * Двойник БД честно исполняет `orderBy` + `take` из запроса роута: без
 * `take` он отдаёт всю историю. Ответ роут дополнительно режет `slice`,
 * поэтому дефект «БД читает всё» в форме ответа НЕ виден — его ловит
 * отдельный кейс по тому, что ушло в БД на каждом из трёх путей чтения
 * (и гейт `check:include-where`).
 *
 * @probe  2026-10-30: убрать `take` из `chatInclude` → красный только
 *         «каждый путь чтения…» (`take` = undefined); кейсы по ответу
 *         остались зелёными — ровно потому, что ответ режет `slice`.
 * @probe  2026-10-30: убрать `.reverse()` → красные «отдаёт последние N…»,
 *         «короткая переписка…», «сообщения одной секунды…» (порядок обратный).
 */

type StoredMessage = {
  id: string;
  senderType: "CLIENT" | "MASTER";
  senderName: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  attachmentMediaAssetId: string | null;
};

type MessagesArgs = {
  orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>;
  take?: number;
};

const store = vi.hoisted(() => ({
  messages: [] as StoredMessage[],
  chatExists: true,
  createConflict: false,
  calls: [] as Array<{ op: string; take: number | undefined }>,
}));

function applyMessagesArgs(args: MessagesArgs | undefined): StoredMessage[] {
  const orderBy = args?.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
  const sorted = [...store.messages].sort((a, b) => {
    for (const clause of orderBy) {
      const [field, direction] = Object.entries(clause)[0] as [keyof StoredMessage, "asc" | "desc"];
      const left = a[field] instanceof Date ? (a[field] as Date).getTime() : String(a[field]);
      const right = b[field] instanceof Date ? (b[field] as Date).getTime() : String(b[field]);
      if (left === right) continue;
      const cmp = left < right ? -1 : 1;
      return direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
  return typeof args?.take === "number" ? sorted.slice(0, args.take) : sorted;
}

function chatRow(include: { messages?: MessagesArgs } | undefined) {
  return { id: "chat-1", bookingId: "b1", messages: applyMessagesArgs(include?.messages) };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookingChat: {
      findUnique: vi.fn(async (args: { include?: { messages?: MessagesArgs } }) => {
        store.calls.push({ op: "findUnique", take: args.include?.messages?.take });
        return store.chatExists ? chatRow(args.include) : null;
      }),
      create: vi.fn(async (args: { include?: { messages?: MessagesArgs } }) => {
        store.calls.push({ op: "create", take: args.include?.messages?.take });
        if (store.createConflict) {
          store.chatExists = true;
          throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
        }
        store.chatExists = true;
        return chatRow(args.include);
      }),
    },
    chatMessage: {
      count: vi.fn(async () => 0),
    },
  },
}));
vi.mock("@/lib/auth/access", () => ({
  getSessionUser: async () => ({ userId: "client-1", roles: ["CLIENT"] }),
}));
vi.mock("@/lib/chat/access", () => ({
  resolveChatAccess: async () => ({
    ok: true,
    senderType: "CLIENT",
    availability: { canSend: true, isReadOnly: false },
  }),
}));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const { GET } = await import("@/app/api/bookings/[id]/chat/route");

function seedMessages(count: number) {
  const start = Date.UTC(2026, 9, 1, 9, 0, 0);
  store.messages = Array.from({ length: count }, (_, index) => ({
    id: `msg-${String(index + 1).padStart(3, "0")}`,
    senderType: index % 2 === 0 ? "CLIENT" : "MASTER",
    senderName: index % 2 === 0 ? "Клиент" : "Мастер",
    body: `Сообщение ${index + 1}`,
    readAt: null,
    createdAt: new Date(start + index * 60_000),
    attachmentMediaAssetId: null,
  }));
}

async function readChat() {
  const res = await GET(new Request("https://app.test/api/bookings/b1/chat") as never, {
    params: Promise.resolve({ id: "b1" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    data: { messages: Array<{ id: string }>; hasOlderMessages: boolean };
  };
  return body.data;
}

beforeEach(() => {
  store.messages = [];
  store.chatExists = true;
  store.createConflict = false;
  store.calls = [];
});

describe("GET /api/bookings/[id]/chat — потолок сообщений (CHAT-MESSAGES-TAKE)", () => {
  it("отдаёт последние N сообщений в хронологическом порядке", async () => {
    seedMessages(150);

    const data = await readChat();

    expect(data.messages).toHaveLength(CHAT_THREAD_PAGE_SIZE);
    expect(data.messages[0]?.id).toBe("msg-051");
    expect(data.messages.at(-1)?.id).toBe("msg-150");
    const ids = data.messages.map((message) => message.id);
    expect(ids).toEqual([...ids].sort());
    expect(data.hasOlderMessages).toBe(true);
  });

  it("короткая переписка приходит целиком и без признака более ранних", async () => {
    seedMessages(30);

    const data = await readChat();

    expect(data.messages.map((message) => message.id)).toEqual(store.messages.map((message) => message.id));
    expect(data.hasOlderMessages).toBe(false);
  });

  it("ровно N сообщений — без признака более ранних", async () => {
    seedMessages(CHAT_THREAD_PAGE_SIZE);

    const data = await readChat();

    expect(data.messages).toHaveLength(CHAT_THREAD_PAGE_SIZE);
    expect(data.hasOlderMessages).toBe(false);
  });

  it("сообщения одной секунды упорядочены по id", async () => {
    seedMessages(3);
    const same = new Date(Date.UTC(2026, 9, 1, 9, 0, 0));
    store.messages = store.messages.map((message) => ({ ...message, createdAt: same }));

    const data = await readChat();

    expect(data.messages.map((message) => message.id)).toEqual(["msg-001", "msg-002", "msg-003"]);
  });

  it("каждый путь чтения (создание чата и повторное чтение после гонки) ограничен", async () => {
    seedMessages(150);
    store.chatExists = false;
    store.createConflict = true;

    const data = await readChat();

    expect(store.calls.map((call) => call.op)).toEqual(["findUnique", "create", "findUnique"]);
    for (const call of store.calls) {
      expect(call.take).toBe(CHAT_THREAD_PAGE_SIZE + 1);
    }
    expect(data.messages).toHaveLength(CHAT_THREAD_PAGE_SIZE);
  });
});
