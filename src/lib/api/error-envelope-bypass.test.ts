import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FIX-B14 · OTP-RATE-LIMIT-RAW-ENVELOPE — инвентарь ответов, собранных МИМО
 * `fail()` / `jsonFail()`, заморожен.
 *
 * ## Зачем
 *
 * `check:error-message-lang` обещает ловить английский текст, покидающий сервер
 * к пользователю. Обещание держится ровно на пяти каналах, которые гейт знает
 * поимённо (`fail` / `jsonFail` / `new AppError` / `tooManyRequests` /
 * `validationError`). Ответ, собранный `NextResponse.json(...)` руками, для него
 * невидим **по построению** — это не пропуск, а граница области.
 *
 * Цена границы была не теоретической: `/api/auth/otp/*` при обрыве Redis
 * отдавал `{"error":"RATE_LIMIT_UNAVAILABLE","retryAfterSec":60}` — машинный
 * код по-английски вместо сообщения, на единственном включённом в проде канале
 * входа, — и гейт при этом печатал «OK». Живая проба ERR-LOCALIZATION-01 это
 * ВИДЕЛА и записала в комментарий спеки; в гейт находка не превратилась.
 *
 * ## Что делает этот сторож
 *
 * Полноту тут вывести нельзя (законные обходы существуют: стриминг, свои
 * заголовки, прокси без request-контекста), поэтому — правило 2 из
 * GUARD-INTEGRITY: **инвентарь заморожен, падаем на дельте**. Новый обход
 * появляется как красный тест с именем файла, а не как английская строка на
 * боевом экране. Запись в инвентарь обязана нести причину.
 *
 * Формулировка обещания гейта в `docs/QUALITY-GATES.md` сужена этим же
 * изменением: он покрывает пять каналов, а не «любое сообщение».
 *
 * @probe   что сломать: добавить в `src/app/api/health/route.ts`
 *          `return NextResponse.json({ ok: false, error: "NOPE" }, { status: 503 });`
 *          наблюдалось: «конверт собран мимо fail()/jsonFail() и не заморожен
 *          в инвентаре: src/app/api/health/route.ts (1)» — падает утверждение
 *          о дельте и называет файл.
 *
 * @probe   🔴 **FIX-C7 · RETRO-PROBE — прежняя проба была МИНИМАЛЬНОЙ (одна из
 *          трёх форм), и сторож оказался WEAKER-THAN-CLAIMED с ЖИВОЙ дырой.**
 *          A/B: тот же ответ, тот же файл, три формы записи —
 *            · `NextResponse.json({ ok:false … }, { status: 503 })` → 1 failed;
 *            · `new Response(JSON.stringify({ ok:false … }), { status })` → passed;
 *            · `Response.json({ ok:false … }, { status: 503 })`      → passed.
 *          Расширение детектора на две слепые формы немедленно показало **9
 *          сайтов в 3 файлах**, до этого невидимых: `api/health/worker` (6, с
 *          английскими «Service unavailable» / «Unauthorized» — у них не было
 *          НИ ОДНОГО наблюдателя, потому что `check:error-message-lang` тоже
 *          знает только именованные каналы), `api/og/profile` (2),
 *          `api/public/stats` (1). Заморожены с честными причинами; посайтовый
 *          разбор — `ENVELOPE-BYPASS-TRIAGE-02` в BACKLOG.
 *          Повторная проба после расширения: обе прежде слепые формы в
 *          `api/health/route.ts` → 1 failed, файл назван.
 */

const SRC = join(process.cwd(), "src");

/**
 * Файл → сколько в нём ручных конвертов ошибки и почему это законно.
 *
 * 🔴 Числа здесь — не документация, а ЗАМОК: любое расхождение красное, в том
 * числе уменьшение (обход убрали → строка обязана уйти вместе с ним).
 */
const FROZEN_BYPASS_INVENTORY: Record<string, { count: number; reason: string }> = {
  /**
   * FIX-B18 · SUPPORT-ENVELOPE-SHAPE — инвентарь схлопнут с 8 файлов (33 сайта)
   * до одного (3 сайта). Решение принято ПОСАЙТОВО, а не оптом; полный разбор —
   * в отчёте, здесь — итог и единственная ратификация.
   *
   * Сведены к конверту (7 файлов, 30 сайтов): обе support-поверхности,
   * `media/file`, `chat/attachment`, оба `public/bookings`, `master/profile`.
   * У всех семи «своя форма» оказалась не требованием, а привычкой: ни один
   * технический признак не мешал вызвать `jsonFail()` (он возвращает обычный
   * `NextResponse`, и потоковая ветка успеха его не касается). Побочно они
   * получили `requestId` и — что важнее — репортинг 5xx в трекер, которого у
   * ручного конверта не было вовсе.
   *
   * 🔴 Аудит нашёл в `master/profile` то, что строка инвентаря отрицала:
   * ЧЕТЫРЕ не-русских сообщения (`"Unauthorized"` и трижды
   * `"ADDRESS_COORDS_REQUIRED"` — машинный код в поле текста, дефект FIX-B14).
   * Гейт языка их не видел именно потому, что конверт был ручным. Это и есть
   * ответ на вопрос «конвергировать или ратифицировать»: ратификация формы
   * означала бы ратификацию и слепой зоны вокруг неё.
   */
  "src/proxy.ts": {
    count: 3,
    reason:
      "РАТИФИЦИРОВАНО (FIX-B18): у прокси нет request-контекста, на котором работает " +
      "getRequestId() внутри fail() — это не привычка, а отсутствие механизма. Конверт " +
      "собран руками той же формы (FIX-B12), тексты русские, коды различают 429/503. " +
      "Единственный законный обход в форме `NextResponse.json` — но НЕ единственный " +
      "в дереве, см. три строки ниже (FIX-C7).",
  },

  /* ---------------------------------------------------------------- *
   * 🔴 FIX-C7 · RETRO-PROBE — найдены расширением детектора на две
   * формы, которых он не видел (`Response.json(`, `new Response(`).
   * Это ЗАМОРОЗКА, а НЕ ратификация: ни один из трёх не разбирался
   * посайтово, как это делал FIX-B18. Разбор — `ENVELOPE-BYPASS-TRIAGE-02`
   * в BACKLOG. Строки стоят здесь, чтобы список перестал молчать о них.
   * ---------------------------------------------------------------- */

  "src/app/api/health/worker/route.ts": {
    count: 6,
    reason:
      "🔴 НЕ РАЗОБРАН (FIX-C7). Шесть конвертов через `Response.json(...)`, тексты " +
      "АНГЛИЙСКИЕ: «Service unavailable» ×4, «Unauthorized». `check:error-message-lang` " +
      "их не видит по построению (он знает пять именованных каналов), и этот сторож не " +
      "видел тоже — то есть у английских строк не было НИ ОДНОГО наблюдателя. Смягчающее: " +
      "роут гейтится секретом `WORKER_SECRET` и адресован мониторингу, а не человеку, " +
      "поэтому язык здесь — вопрос конвенции, а не UX. Решать посайтово.",
  },

  "src/app/api/og/profile/route.tsx": {
    count: 2,
    reason:
      "ВЕРОЯТНО ЗАКОННЫЙ (FIX-C7), но не проверен: маршрут отдаёт КАРТИНКУ (`next/og`), " +
      "и его потребитель — тег `<img>`, которому JSON-конверт бесполезен ровно так же, " +
      "как в FIX-C3 · F3-3. `new Response(\"Missing username\", { status: 400 })` — это " +
      "текст/плейн, а не конверт. Проверить, не должен ли ответ быть плейсхолдер-картинкой.",
  },

  "src/app/api/public/stats/route.ts": {
    count: 1,
    reason:
      "🔴 НЕ РАЗОБРАН (FIX-C7) и выглядит чистой привычкой: `new Response(JSON.stringify(" +
      "{ ok: false, error: { message } }))` руками воспроизводит форму `fail()` — но без " +
      "`requestId` и без репортинга 5xx в трекер. Ровно тот класс, который FIX-B18 свёл " +
      "к конверту в семи файлах; этот восьмой он не увидел.",
  },
};

const IGNORED_DIRS = new Set(["node_modules"]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Формы, которыми ответ собирается руками.
 *
 * 🔴 **FIX-C7 · RETRO-PROBE — их ТРИ, а считалась одна.** Прежняя проба
 * («дописать `NextResponse.json({ ok: false … }, { status: 503 })` в
 * `api/health/route.ts`») краснела, а тот же ответ в двух других формах, в том
 * же файле, — нет:
 *   · `NextResponse.json({ ok: false, … }, { status: 503 })`        → 1 failed;
 *   · `new Response(JSON.stringify({ ok: false, … }), { status })`  → **passed**;
 *   · `Response.json({ ok: false, … }, { status: 503 })`            → **passed**.
 *
 * И это НЕ гипотетика: обе слепые формы в дереве живые —
 * `api/health/worker/route.ts` собирает **7** конвертов ошибки через
 * `Response.json(...)` (включая английские `"Service unavailable"` /
 * `"Unauthorized"`), `api/public/stats/route.ts` — один через
 * `new Response(JSON.stringify(...))`. То есть строка «единственный законный
 * обход в дереве» напротив `src/proxy.ts` была неверна, и неверна она была
 * именно потому, что детектор смотрел на одно имя из трёх.
 */
const ENVELOPE_FORMS = ["NextResponse.json(", "Response.json(", "new Response("] as const;

/**
 * Считает ручные конверты ответа, чей аргумент выглядит ответом об ошибке.
 * Признак — `ok: false` либо числовой `status` ≥ 400 внутри самого вызова:
 * 2xx-ответы (`jsonOk`-подобные) в инвентарь не входят.
 *
 * ⚠️ `NextResponse.json(` — префикс, оканчивающийся на `Response.json(`,
 * поэтому позиции дедуплицируются по КОНЦУ вызова: иначе один вызов считался
 * бы дважды. Аналогично `new Response(` не пересекается с остальными.
 */
function countErrorEnvelopes(source: string): number {
  const counted = new Set<number>();
  for (const form of ENVELOPE_FORMS) {
    let from = 0;
    while (true) {
      const at = source.indexOf(form, from);
      if (at === -1) break;
      from = at + 1;
      let depth = 1;
      let j = at + form.length;
      while (j < source.length && depth > 0) {
        const ch = source[j];
        if (ch === "(") depth += 1;
        else if (ch === ")") depth -= 1;
        j += 1;
      }
      const call = source.slice(at, j);
      const numericStatus = call.match(/status:\s*(\d{3})/);
      const isError =
        /\bok:\s*false/.test(call) || (numericStatus !== null && Number(numericStatus[1]) >= 400);
      if (isError) counted.add(j);
    }
  }
  return counted.size;
}

function scan(): Map<string, number> {
  const found = new Map<string, number>();
  for (const file of listSourceFiles(SRC)) {
    const count = countErrorEnvelopes(readFileSync(file, "utf8"));
    if (count === 0) continue;
    found.set(relative(process.cwd(), file).split(sep).join("/"), count);
  }
  return found;
}

describe("FIX-B14 — обходы конверта ошибок заморожены (слепая зона check:error-message-lang)", () => {
  const found = scan();

  /**
   * FIX-B15 — не-вакуумность держится на МАШИНЕРИИ, а не на числе находок.
   *
   * 🔴 Здесь стояло `expect(found.size).toBeGreaterThan(0)` — то есть сторож
   * требовал, чтобы обходы СУЩЕСТВОВАЛИ. Это самоуничтожение на успехе: в день,
   * когда `SUPPORT-ENVELOPE-SHAPE` будет закрыт и последний обход исчезнет,
   * красным стал бы сам сторож — и его бы ослабили или удалили ровно тогда,
   * когда кодовая база стала лучше. Тот же дефект, который FIX-B12 нашёл у
   * триаж-гейта (`detected.length > 10`), воспроизведённый в FIX-B14 сутками
   * позже.
   *
   * Замена: распознавание проверяется на фиксированной фикстуре — положительный
   * и отрицательный контроль. Они не зависят ни от состояния кодовой базы, ни
   * от того, сколько обходов осталось; сломанный разборщик краснеет здесь, а
   * пустой инвентарь остаётся законным успехом.
   */
  it("счётчик отличает конверт ошибки от успешного ответа (контроль машинерии)", () => {
    // FIX-C7: фикстура покрывает ВСЕ ТРИ формы. Прежняя знала одну, и ровно
    // поэтому контроль машинерии оставался зелёным, пока две другие были слепы.
    const errorEnvelope = `
      NextResponse.json({ ok: false, error: { message: "Ошибка.", code: "X" } }, { status: 400 });
      NextResponse.json({ error: "BOOM" }, { status: 503 });
      Response.json({ error: "Service unavailable" }, { status: 503 });
      new Response(JSON.stringify({ ok: false, error: { message: "Ошибка." } }), { status: 500 });
    `;
    const successEnvelope = `
      NextResponse.json({ ok: true, data: { id: 1 } }, { status: 201 });
      NextResponse.json({ ok: true, data: {} });
      Response.json({ ok: true, data: { id: 2 } });
      new Response(JSON.stringify({ ok: true }), { status: 200 });
    `;
    expect(
      countErrorEnvelopes(errorEnvelope),
      "разборщик перестал видеть ручной конверт ошибки — главное утверждение стало бы вакуумным",
    ).toBe(4);
    expect(
      countErrorEnvelopes(successEnvelope),
      "разборщик считает успешные ответы обходами — инвентарь наполнится шумом",
    ).toBe(0);
  });

  it("новых обходов нет, исчезнувшие удалены из инвентаря", () => {
    const unexpected: string[] = [];
    const drifted: string[] = [];
    for (const [file, count] of found) {
      const frozen = FROZEN_BYPASS_INVENTORY[file];
      if (!frozen) {
        unexpected.push(`${file} (${count})`);
        continue;
      }
      if (frozen.count !== count) drifted.push(`${file}: заморожено ${frozen.count}, найдено ${count}`);
    }
    const vanished = Object.keys(FROZEN_BYPASS_INVENTORY).filter((file) => !found.has(file));

    expect(
      unexpected,
      `конверт собран мимо fail()/jsonFail() и не заморожен в инвентаре:\n${unexpected.join("\n")}\n\n` +
        "check:error-message-lang такой ответ НЕ ВИДИТ. Либо перевести на fail()/jsonFail(), " +
        "либо внести в FROZEN_BYPASS_INVENTORY с причиной и русским текстом.",
    ).toEqual([]);
    expect(drifted, `число обходов в файле изменилось:\n${drifted.join("\n")}`).toEqual([]);
    expect(
      vanished,
      `обходы исчезли — удалите строки из инвентаря:\n${vanished.join("\n")}`,
    ).toEqual([]);
  });

  it("auth-поверхности в инвентаре отсутствуют — они переведены на конверт", () => {
    const authBypass = [...found.keys()].filter(
      (file) =>
        file.startsWith("src/app/api/auth/") ||
        file.startsWith("src/app/api/integrations/") ||
        file.startsWith("src/app/api/telegram/"),
    );
    expect(
      authBypass,
      `auth-поверхность отвечает ручным конвертом:\n${authBypass.join("\n")}\n\n` +
        "Здесь это и была находка FIX-B14: код ошибки уезжал в поле сообщения.",
    ).toEqual([]);
  });
});
