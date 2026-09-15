/**
 * ADMIN-HEALTH-01 — замер длительности входящих запросов к `/api/*`.
 *
 * Почему патч `http.Server`, а не обёртка роутов: у проекта 289 роутов, и
 * общей обёртки у них нет (`withRequestContext` стоит на 17), `ok()`/`fail()`
 * не знают момента начала запроса, а `proxy.ts` не ждёт обработчик и потому
 * измерить его не может. Единственная точка, через которую проходит КАЖДЫЙ
 * запрос и в dev, и в standalone-сборке, — `emit("request")` у Node-сервера,
 * который Next создаёт сам. Тем же приёмом живут APM-агенты.
 *
 * Патч ставится один раз (маркер на прототипе), измеряет от получения
 * запроса до `finish`/`close` ответа и ничего не меняет в обработке. Пробы
 * `/api/health*` исключены: их дёргают compose-healthcheck и воркер каждые
 * несколько секунд, и они утянули бы p95 вниз, ничего не сказав о реальной
 * работе API.
 */

import http from "node:http";
import { recordApiRequest } from "@/lib/monitoring/api-metrics";

const PATCH_MARK = Symbol.for("beautyhub.http-api-metrics-hook");

type PatchedPrototype = http.Server & { [PATCH_MARK]?: true };

export function shouldMeasureRequestPath(url: string | undefined | null): boolean {
  if (!url) return false;
  const path = url.split("?")[0];
  if (!path.startsWith("/api/")) return false;
  if (path === "/api/health" || path.startsWith("/api/health/")) return false;
  return true;
}

function observeResponse(res: http.ServerResponse, startedAt: number): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    recordApiRequest({
      durationMs: performance.now() - startedAt,
      status: res.statusCode,
    });
  };
  res.once("finish", finish);
  res.once("close", finish);
}

/** Установить хук. Возвращает `false`, если он уже стоял. */
export function installHttpApiMetricsHook(): boolean {
  const proto = http.Server.prototype as PatchedPrototype;
  if (proto[PATCH_MARK]) return false;

  const originalEmit = proto.emit;
  const patchedEmit: typeof proto.emit = function patched(
    this: http.Server,
    event: string | symbol,
    ...args: unknown[]
  ) {
    if (event === "request") {
      const req = args[0] as http.IncomingMessage | undefined;
      const res = args[1] as http.ServerResponse | undefined;
      if (req && res && shouldMeasureRequestPath(req.url)) {
        observeResponse(res, performance.now());
      }
    }
    return originalEmit.apply(this, [event, ...args] as Parameters<typeof originalEmit>);
  } as typeof proto.emit;

  proto.emit = patchedEmit;
  proto[PATCH_MARK] = true;
  return true;
}
