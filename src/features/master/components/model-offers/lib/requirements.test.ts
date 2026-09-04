/**
 * FIX-OFFER-REQUIREMENTS — сторож «условие, набранное в поле, доезжает до
 * сервера».
 *
 * Дефект: `RequirementsField` держал набираемый текст в СОБСТВЕННОМ стейте и
 * отдавал наружу только по нажатию Enter. Мастер печатал условие, жал «Создать
 * предложение» — модалка закрывалась, предложение создавалось, условий у него
 * не было. Ни ошибки, ни лога; снаружи это читается как «условия не
 * сохраняются», хотя и роут, и карточка предложения работали.
 *
 * @probe (правило 9 GUARD-INTEGRITY — проба берёт ПРАВДОПОДОБНУЮ форму
 * дефекта, а не минимальную):
 *  1. Возвращена исходная форма отправки — в `create-offer-modal.tsx` вместо
 *     `resolveRequirementsForSubmit(state)` подставлено `state.requirements`.
 *     Красный: «create-offer-modal.tsx: отправляет `state.requirements`
 *     напрямую…». То есть сторож ловит именно ту строку, которой дефект и был.
 *  2. Форма, обходящая простой греп по вызову: черновик собран заранее —
 *     `const reqs = state.requirements; … requirements: reqs`. Тоже красный:
 *     проверка требует ПРИСУТСТВИЯ вызова резолвера в payload-строке, а не
 *     отсутствия подстроки `state.requirements`.
 *  3. Вырожденный вход `appendRequirement([], "  ")` — зелёный и до, и после
 *     фикса, поэтому на нём проба ничего не доказывает; он оставлен как
 *     обычный кейс, а не как проба.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "@/lib/testing/source-scan";
import {
  MAX_REQUIREMENTS,
  appendRequirement,
  commitRequirementDraft,
  resolveRequirementsForSubmit,
} from "./requirements";

describe("appendRequirement", () => {
  it("добавляет условие и обрезает пробелы", () => {
    expect(appendRequirement([], "  натуральные ногти  ")).toEqual(["натуральные ногти"]);
  });

  it("не добавляет пустое и пробельное", () => {
    expect(appendRequirement(["а"], "")).toEqual(["а"]);
    expect(appendRequirement(["а"], "   ")).toEqual(["а"]);
  });

  it("не добавляет дубль без учёта регистра", () => {
    expect(appendRequirement(["Натуральные ногти"], "натуральные НОГТИ")).toEqual([
      "Натуральные ногти",
    ]);
  });

  it("держит потолок в пять условий", () => {
    const full = ["1", "2", "3", "4", "5"];
    expect(full).toHaveLength(MAX_REQUIREMENTS);
    expect(appendRequirement(full, "шестое")).toEqual(full);
  });

  it("не мутирует исходный массив", () => {
    const list = ["а"];
    appendRequirement(list, "б");
    expect(list).toEqual(["а"]);
  });
});

describe("resolveRequirementsForSubmit", () => {
  it("🔴 регрессия: набранное, но не подтверждённое Enter'ом условие уезжает на сервер", () => {
    expect(
      resolveRequirementsForSubmit({ requirements: [], requirementsDraft: "натуральные ногти" }),
    ).toEqual(["натуральные ногти"]);
  });

  it("дописывает черновик к уже набранным чипам", () => {
    expect(
      resolveRequirementsForSubmit({
        requirements: ["без наращивания"],
        requirementsDraft: "свои ногти",
      }),
    ).toEqual(["без наращивания", "свои ногти"]);
  });

  it("пустой черновик ничего не добавляет", () => {
    expect(
      resolveRequirementsForSubmit({ requirements: ["а"], requirementsDraft: "" }),
    ).toEqual(["а"]);
  });

  it("черновик-дубль уже добавленного чипа не удваивает список", () => {
    expect(
      resolveRequirementsForSubmit({ requirements: ["Свои ногти"], requirementsDraft: "свои ногти" }),
    ).toEqual(["Свои ногти"]);
  });
});

describe("commitRequirementDraft", () => {
  it("🔴 регрессия: список и очищенный черновик приходят ОДНИМ объектом", () => {
    const before = { requirements: ["без наращивания"], requirementsDraft: "свои ногти" };
    const after = commitRequirementDraft(before);

    // Оба поля обновлены в одном переходе. Раздельные обновления формы
    // строятся от общего снимка `state`, поэтому второе восстановило бы
    // список из устаревшего значения и чип бы пропал.
    expect(after).toEqual({
      requirements: ["без наращивания", "свои ногти"],
      requirementsDraft: "",
    });
  });

  it("сохраняет посторонние поля состояния формы", () => {
    const after = commitRequirementDraft({
      serviceId: "svc-1",
      requirements: [],
      requirementsDraft: "натуральные ногти",
    });
    expect(after.serviceId).toBe("svc-1");
  });

  it("пустой черновик только очищает поле ввода", () => {
    expect(commitRequirementDraft({ requirements: ["а"], requirementsDraft: "   " })).toEqual({
      requirements: ["а"],
      requirementsDraft: "",
    });
  });

  it("не мутирует исходное состояние", () => {
    const before = { requirements: ["а"], requirementsDraft: "б" };
    commitRequirementDraft(before);
    expect(before).toEqual({ requirements: ["а"], requirementsDraft: "б" });
  });
});

/**
 * Полнота, а не членство: набор отправляющих модалок ВЫВОДИТСЯ из дерева,
 * поэтому третья модалка предложения, шлющая условия мимо резолвера, валит
 * тест просто потому, что появилась (правило 2 GUARD-INTEGRITY).
 *
 * Проверяется ТЕЛО ЗАПРОСА, а не файл целиком: `requirements:` встречается и в
 * объявлении типа, и в начальном состоянии формы — судить по ним значило бы
 * проверять не то, что уезжает на сервер.
 */
describe("полнота: обе модалки отправляют условия через резолвер", () => {
  const MODALS_DIR = "src/features/master/components/model-offers/modals";
  const PAYLOAD_OPEN = "JSON.stringify({";

  /** Тела `JSON.stringify({...})` — от открывающей скобки до парной ей. */
  function requestBodies(source: string): string[] {
    const bodies: string[] = [];
    let from = 0;
    for (;;) {
      const open = source.indexOf(PAYLOAD_OPEN, from);
      if (open === -1) break;
      let depth = 0;
      let i = open + PAYLOAD_OPEN.length - 1;
      for (; i < source.length; i += 1) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      bodies.push(source.slice(open, i + 1));
      from = i + 1;
    }
    return bodies;
  }

  const senders = readdirSync(MODALS_DIR)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => ({
      file,
      bodies: requestBodies(stripComments(readFileSync(join(MODALS_DIR, file), "utf8"))),
    }))
    .map((entry) => ({
      file: entry.file,
      lines: entry.bodies
        .flatMap((body) => body.split(/\r?\n/))
        .filter((line) => /\brequirements:\s/.test(line)),
    }))
    .filter((entry) => entry.lines.length > 0);

  it("такие модалки вообще есть (проверка не вакуумна)", () => {
    expect(senders.map((entry) => entry.file).sort()).toEqual([
      "create-offer-modal.tsx",
      "edit-offer-modal.tsx",
    ]);
  });

  it.each(senders.map((entry) => entry.file))(
    "%s собирает поле `requirements` вызовом резолвера",
    (file) => {
      const { lines } = senders.find((entry) => entry.file === file)!;
      for (const line of lines) {
        expect(
          /requirements:\s*resolveRequirementsForSubmit\(/.test(line),
          `${file}: отправляет условия мимо resolveRequirementsForSubmit — ` +
            `черновик поля снова потеряется. Строка: ${line.trim()}`,
        ).toBe(true);
      }
    },
  );
});
