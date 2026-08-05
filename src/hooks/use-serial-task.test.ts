import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOGIC-23 — три автосейв-хука отправляли перекрывающиеся PATCH'и, и выигрывал
 * последний ОТВЕТ, а не последняя правка. Для расписания это ровно тот
 * сценарий, который порождает дубликаты `ScheduleOverride` и `P2002` на
 * `@@unique([configId, weekday])`; для профиля — тихая потеря части полей.
 *
 * Логика примитива проверяется на его же реализации, вынутой из React-обвязки
 * (сам хук — это `useRef` + `useCallback` вокруг неё; проект не держит
 * jsdom-окружения, а гонка живёт именно в планировщике, не в рендере).
 * Отдельно сторожим, что все три хука действительно на нём сидят, — иначе
 * примитив есть, а дефект остаётся.
 */

type Settle = { resolve: () => void; reject: (error: unknown) => void };

/** Планировщик из `use-serial-task.ts`, дословно (см. тест «не разошёлся»). */
function createSerialRunner<T>(run: (value: T) => Promise<void>) {
  let inFlight: Promise<void> | null = null;
  let queued: { value: T; settle: Settle[] } | null = null;

  const drain = async () => {
    try {
      while (queued) {
        const pending = queued;
        queued = null;
        try {
          await run(pending.value);
          for (const item of pending.settle) item.resolve();
        } catch (error) {
          for (const item of pending.settle) item.reject(error);
        }
      }
    } finally {
      inFlight = null;
    }
  };

  return (value: T) => {
    const promise = new Promise<void>((resolve, reject) => {
      if (queued) {
        queued.value = value;
        queued.settle.push({ resolve, reject });
        return;
      }
      queued = { value, settle: [{ resolve, reject }] };
    });
    if (!inFlight) inFlight = drain();
    return promise;
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("очередь на одного — LOGIC-23", () => {
  it("пока запрос в полёте, второй не стартует параллельно", async () => {
    const started: number[] = [];
    const gate = deferred();
    const request = createSerialRunner<number>(async (value) => {
      started.push(value);
      if (value === 1) await gate.promise;
    });

    void request(1);
    void request(2);
    await Promise.resolve();

    expect(started).toEqual([1]); // второй ждёт, а не летит рядом

    gate.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toEqual([1, 2]);
  });

  it("из нескольких отложенных выполняется ПОСЛЕДНИЙ, и ровно один раз", async () => {
    const started: string[] = [];
    const gate = deferred();
    const request = createSerialRunner<string>(async (value) => {
      started.push(value);
      if (value === "a") await gate.promise;
    });

    void request("a");
    void request("b");
    void request("c");
    void request("d");

    gate.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // «b» и «c» — промежуточные состояния черновика, сохранять их незачем;
    // важно, что «d» не потерян.
    expect(started).toEqual(["a", "d"]);
  });

  it("промис отложенного запроса резолвится — на этом держится flush", async () => {
    const gate = deferred();
    const request = createSerialRunner<string>(async (value) => {
      if (value === "first") await gate.promise;
    });

    void request("first");
    let settled = false;
    const queuedPromise = request("second").then(() => {
      settled = true;
    });

    gate.resolve();
    await queuedPromise;
    expect(settled).toBe(true);
  });

  it("упавший прогон не заклинивает очередь", async () => {
    const started: string[] = [];
    const gate = deferred();
    const request = createSerialRunner<string>(async (value) => {
      started.push(value);
      if (value === "boom") {
        await gate.promise;
        throw new Error("save failed");
      }
    });

    const failing = request("boom");
    const next = request("after");
    gate.resolve();

    await expect(failing).rejects.toThrow("save failed");
    await next;
    expect(started).toEqual(["boom", "after"]);
  });

  it("после опустошения очереди новый запрос стартует, а не ждёт вечно", async () => {
    const started: string[] = [];
    const request = createSerialRunner<string>(async (value) => {
      started.push(value);
    });

    await request("one");
    await request("two");
    expect(started).toEqual(["one", "two"]);
  });
});

describe("автосейв-хуки сидят на общем примитиве (LOGIC-23)", () => {
  const CONSUMERS = [
    "src/features/client-cabinet/profile/hooks/use-profile-autosave.ts",
    "src/features/master/components/schedule-settings/use-auto-save.ts",
    "src/features/master/components/profile/editable/use-autosave.ts",
  ];

  for (const file of CONSUMERS) {
    it(`${file} использует useSerialTask`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain('from "@/hooks/use-serial-task"');
      expect(source).toMatch(/useSerialTask[<(]/);
    });
  }

  it("копия планировщика в тесте не разошлась с реализацией", () => {
    const source = readFileSync(resolve(process.cwd(), "src/hooks/use-serial-task.ts"), "utf8");
    // Три места, где ломается сериализация, если их переписать:
    // замещение отложенного, старт только при свободном слоте, снятие флага
    // в том же синхронном шаге, что и выход из цикла.
    expect(source).toContain("queued.value = value;");
    expect(source).toContain("if (!inFlightRef.current) {");
    expect(source).toMatch(/finally\s*\{\s*\n\s*\/\/[\s\S]*?inFlightRef\.current = null;/);
  });
});
