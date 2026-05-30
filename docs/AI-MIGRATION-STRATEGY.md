# AI Provider Migration Strategy — OpenAI → Yandex

> **Phase 3 deliverable** of OPENAI-TO-YANDEX-MIGRATION (BACKLOG.md).
> Reads directly into per-surface Phase 4 implementation prompts.
> Synthesized from Phase 1 audit (AI-CURRENT-STATE-AUDIT) + Phase 2 research (YANDEX-GPT-RESEARCH).
>
> **Status:** plan-only — NO code, env, or schema changes from this document.
> **Reversibility paramount:** entire migration controlled by one env var (`AI_PROVIDER`).

---

## 1. Architecture overview

### Before

```
[Route handler]
       ↓
[Service file: review-summary.ts / review-reply.ts / service-description.ts / advisor/ai-advice.ts]
       ↓
[aiChat(systemPrompt, userPrompt, opts) — src/lib/ai/client.ts]
       ↓
[OpenAI SDK client — singleton, apiKey = env.OPENAI_API_KEY]
       ↓
[https://api.openai.com (default baseURL)]
       ↓
[Model: gpt-4o-mini]
```

### After

```
[Route handler]
       ↓
[Service file]  ← UNCHANGED
       ↓
[aiChat(...) — src/lib/ai/client.ts]  ← MODIFIED (provider switch)
       ↓
[OpenAI SDK client — singleton, baseURL + apiKey chosen by AI_PROVIDER]
       ↓
[AI_PROVIDER=openai → https://api.openai.com (default, existing behavior)]
[AI_PROVIDER=yandex → https://llm.api.cloud.yandex.net/v1 (compat endpoint)]
       ↓
[Model name resolved per provider:]
[  openai → 'gpt-4o-mini']
[  yandex → 'gpt://<YANDEX_FOLDER_ID>/yandexgpt-lite/latest']
```

### Files touched

| File | Change | Reason |
|---|---|---|
| `src/lib/ai/client.ts` | provider-aware client init + model resolver | core switch point |
| `src/lib/ai/config.ts` | add `getCurrentAIProvider()` helper | export provider state to callers |
| `src/lib/env.ts` | 3 new env vars + refine | configuration source-of-truth |
| `.env.example` | document new vars | dev onboarding |
| `.env.production.example` | document new vars | prod template |
| `src/lib/ai/client.test.ts` (NEW, optional) | provider-switching unit tests | pin contract |

### Files NOT touched (4 surface services preserve `aiChat()` abstraction)

- `src/lib/ai/prompts.ts` — Russian prompts work as-is; YandexGPT 5 Lite is native-Russian, prompt quality unchanged at swap
- `src/lib/ai/review-summary.ts` — consumes `aiChat()`, no change
- `src/lib/ai/review-reply.ts` — same
- `src/lib/ai/service-description.ts` — same
- `src/lib/advisor/ai-advice.ts` — same (still uses `aiChat()` via `AI_PROMPTS.advisorAdvice`)
- All consumer route handlers — untouched
- All 5 `src/lib/visual-search/*` files — defer per Section 4

---

## 2. Feature flag strategy

### New env vars

```bash
# AI provider configuration
AI_PROVIDER=openai          # default — OpenAI direct (preserves existing behavior)
# AI_PROVIDER=yandex        # switch to Yandex via OpenAI-compat endpoint

# Required ONLY if AI_PROVIDER=yandex
YANDEX_API_KEY=             # service account API key, scope: yc.ai.foundationModels.execute
YANDEX_FOLDER_ID=           # Yandex Cloud folder ID for model URI
```

### env.ts schema additions

```typescript
// After SMS provider block, before computed flags
AI_PROVIDER: z.enum(["openai", "yandex"]).default("openai"),
YANDEX_API_KEY: z.string().optional(),
YANDEX_FOLDER_ID: z.string().optional(),
```

### env.ts refine

```typescript
.refine(
  (e) => e.AI_PROVIDER !== "yandex" || (Boolean(e.YANDEX_API_KEY) && Boolean(e.YANDEX_FOLDER_ID)),
  "AI_PROVIDER=yandex requires YANDEX_API_KEY + YANDEX_FOLDER_ID"
)
```

Pattern mirrors existing `SMS_PROVIDER_ENABLED → SMS_PROVIDER_LOGIN+PASSWORD` refine and `VISUAL_SEARCH_ENABLED → OPENAI_API_KEY` refine.

### Existing env vars — preserved

- `OPENAI_API_KEY` — **stays in env post-migration** for fast rollback (no code change required to switch back to OpenAI; `AI_PROVIDER=openai` re-uses the existing key)
- `AI_FEATURES_ENABLED` — semantics unchanged (master toggle for ALL AI surfaces, provider-agnostic)
- `VISUAL_SEARCH_ENABLED` — unchanged (visual search defers; still gates `src/lib/visual-search/*`)

### Rollout sequence (env-driven, no redeploy needed between provider switches)

1. Deploy Phase 4a (wrapper + env additions) with `AI_PROVIDER=openai` → zero behavior change in prod
2. Set `AI_PROVIDER=yandex` in **dev** + add `YANDEX_API_KEY` + `YANDEX_FOLDER_ID` → manual smoke
3. Quality validation per surface (Section 6) → green-light per surface or hold
4. Set `AI_PROVIDER=yandex` in **production** → monitor 1 week
5. Rollback procedure: set `AI_PROVIDER=openai` in prod env, redeploy OR runtime reload — full reversion in minutes

---

## 3. File-level diffs

### File 1: `src/lib/ai/client.ts` (modified)

**Diff intent (showing critical changes):**

```diff
 import OpenAI from "openai";
 import { AppError } from "@/lib/api/errors";
-import { env } from "@/lib/env";
+import { env } from "@/lib/env";
 import { logError, logInfo } from "@/lib/logging/logger";
 import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";

-const AI_MODEL = "gpt-4o-mini";
+// Model resolved per provider in `resolveModel()` below.
 const AI_TIMEOUT_MS = 15_000;
 const AI_MAX_RETRIES = 1;

 let client: OpenAI | null = null;

-function getApiKey(): string {
-  const apiKey = env.OPENAI_API_KEY?.trim();
-  if (!apiKey) {
-    throw new AppError("OPENAI_API_KEY is not configured", 500, "INTERNAL_ERROR");
-  }
-  return apiKey;
+function getProviderConfig(): { apiKey: string; baseURL?: string } {
+  if (env.AI_PROVIDER === "yandex") {
+    const apiKey = env.YANDEX_API_KEY?.trim();
+    if (!apiKey) {
+      throw new AppError("YANDEX_API_KEY is not configured", 500, "INTERNAL_ERROR");
+    }
+    return { apiKey, baseURL: "https://llm.api.cloud.yandex.net/v1" };
+  }
+  const apiKey = env.OPENAI_API_KEY?.trim();
+  if (!apiKey) {
+    throw new AppError("OPENAI_API_KEY is not configured", 500, "INTERNAL_ERROR");
+  }
+  return { apiKey };
+}

+function resolveModel(): string {
+  if (env.AI_PROVIDER === "yandex") {
+    const folderId = env.YANDEX_FOLDER_ID?.trim();
+    if (!folderId) {
+      throw new AppError("YANDEX_FOLDER_ID is not configured", 500, "INTERNAL_ERROR");
+    }
+    return `gpt://${folderId}/yandexgpt-lite/latest`;
+  }
+  return "gpt-4o-mini";
+}

 function getClient(): OpenAI {
   if (!client) {
-    client = new OpenAI({ apiKey: getApiKey() });
+    const { apiKey, baseURL } = getProviderConfig();
+    client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
   }
   return client;
 }
```

**aiChat() body — minimal edit (replace `AI_MODEL` with `resolveModel()`):**

```diff
       const completion = await getClient().chat.completions.create(
         {
-          model: AI_MODEL,
+          model: opts.model ?? resolveModel(),
           temperature,
           ...(maxTokens ? { max_tokens: maxTokens } : {}),
           messages: [
             { role: "system", content: systemPrompt },
             { role: "user", content: userPrompt },
           ],
         },
         { signal: AbortSignal.timeout(AI_TIMEOUT_MS) },
       );
```

Note: `AiChatOptions` already has optional `model` field — per-surface override (e.g. advisor → Pro) works without API change.

**Failure logging — preserved verbatim.** The OpenAI-compat endpoint returns OpenAI-shaped error objects (status 429 / 5xx / etc), so `isRetryable()` and `logAiFailure()` work unmodified.

### File 2: `src/lib/ai/config.ts` (additive)

```diff
+/** Returns the active AI provider — used by call sites that need to log provider attribution. */
+export function getCurrentAIProvider(): "openai" | "yandex" {
+  return env.AI_PROVIDER;
+}
```

Existing `getAiFeaturesEnabled()` / `assertAiFeaturesEnabled()` / `clearAiFeaturesEnabledCache()` — unchanged. The feature-gate semantics are provider-agnostic.

### File 3: `src/lib/env.ts` (additive)

Add to schema (placement: near OpenAI block):

```typescript
// ── AI provider ──────────────────────────────────────────────────────────────
AI_PROVIDER: z.enum(["openai", "yandex"]).default("openai"),
YANDEX_API_KEY: z.string().optional(),
YANDEX_FOLDER_ID: z.string().optional(),
```

Add refine (placement: near `VISUAL_SEARCH_ENABLED → OPENAI_API_KEY` refine):

```typescript
.refine(
  (e) =>
    e.AI_PROVIDER !== "yandex" ||
    (Boolean(e.YANDEX_API_KEY) && Boolean(e.YANDEX_FOLDER_ID)),
  "AI_PROVIDER=yandex requires YANDEX_API_KEY + YANDEX_FOLDER_ID"
)
```

Existing refine `AI_FEATURES_ENABLED || OPENAI_API_KEY` — **update** to provider-aware:

```diff
 .refine(
-  (e) => !e.AI_FEATURES_ENABLED || Boolean(e.OPENAI_API_KEY),
-  "OPENAI_API_KEY is required when AI_FEATURES_ENABLED=true"
+  (e) =>
+    !e.AI_FEATURES_ENABLED ||
+    (e.AI_PROVIDER === "yandex"
+      ? Boolean(e.YANDEX_API_KEY) && Boolean(e.YANDEX_FOLDER_ID)
+      : Boolean(e.OPENAI_API_KEY)),
+  "AI_FEATURES_ENABLED=true requires the active provider's credentials"
 )
```

The `VISUAL_SEARCH_ENABLED || OPENAI_API_KEY` refine — **keep unchanged** (visual search defers and still uses OpenAI specifically, per Section 4).

### File 4: `.env.example` (additive)

```diff
 # ── OpenAI ────────────────────────────────────────────────────────────
 OPENAI_API_KEY=

+# ── AI provider switch (MIGRATION-STRATEGY 2026-05-30) ───────────────
+# Default: openai (preserves existing behavior, uses OPENAI_API_KEY above).
+# Set to "yandex" to route the 4 chat surfaces through Yandex Cloud's
+# OpenAI-compatible endpoint (https://llm.api.cloud.yandex.net/v1).
+# Visual search (`src/lib/visual-search/*`) still uses OpenAI regardless
+# of this setting — that path defers to post-launch.
+AI_PROVIDER=openai
+
+# Required ONLY if AI_PROVIDER=yandex. Get values from Yandex Cloud console:
+# • YANDEX_API_KEY = service account API key, scope yc.ai.foundationModels.execute
+# • YANDEX_FOLDER_ID = folder identifier (used in model URI)
+YANDEX_API_KEY=
+YANDEX_FOLDER_ID=
```

### File 5: `.env.production.example` (additive)

Same block as above, with production framing:

```diff
+# ── AI provider switch (MIGRATION-STRATEGY 2026-05-30) ───────────────
+# Production guidance: ship initial deploy with AI_PROVIDER=openai (existing
+# baseline). After Phase 4 validation in dev/staging completes, flip to
+# yandex via env-var change (no code redeploy needed).
+# Keep OPENAI_API_KEY populated post-migration — instant rollback path.
+AI_PROVIDER=openai
+YANDEX_API_KEY=
+YANDEX_FOLDER_ID=
```

### File 6: `src/lib/ai/client.test.ts` (NEW, optional)

Pure-helper unit tests for `getProviderConfig()` + `resolveModel()` decision logic. Mirrors the `isVapidConfigured` pattern (extract pure logic, test in isolation without triggering the OpenAI client side-effect).

Estimated 6-8 tests:
- openai provider: returns OPENAI_API_KEY + undefined baseURL + `gpt-4o-mini`
- yandex provider with both creds: returns YANDEX_API_KEY + compat baseURL + `gpt://<folder>/yandexgpt-lite/latest`
- yandex provider missing API key: throws AppError 500
- yandex provider missing folder: throws AppError 500
- openai provider missing API key: throws AppError 500
- model URI string format exact match (regression pin)

### TBD verify in Phase 4a (implementation)

- Yandex compat endpoint response shape exactly matches OpenAI's `response.choices[0].message.content` access path (Phase 2 research says yes, but verify with one live request before deploying Phase 4b+)
- Yandex compat endpoint accepts `temperature` + `max_tokens` parameters identically
- Yandex error response shape matches OpenAI's `error.status` / `error.code` / `error.name` for `isRetryable()` + `logAiFailure()` to keep working unchanged
- Whether `model` URI `gpt://<folder>/yandexgpt-lite/latest` works as `model` field via the compat layer, OR whether compat requires a different model-name format (e.g. `yandexgpt-lite` alias)

---

## 4. Visual search defer (DOCUMENTED post-launch path)

### Decision (evidence-based, per Phase 2 research)

**DEFER visual search migration to post-launch.** Three reasons:

1. **0 vectors stored currently** — zero historical re-indexing burden. Whatever model gets chosen post-launch, indexing starts fresh.
2. **YandexGPT brand models text-only** — 3 independent sources confirm. Vision exists on Yandex AI Studio platform via separate `multimodels-request` endpoint (likely hosting Qwen-VL / LLaVA-family open-source VLMs), but specific catalog + pricing requires API spike-testing.
3. **OpenAI-compat endpoint does NOT pass vision** — `https://llm.api.cloud.yandex.net/v1` covers chat + embeddings only. Visual search would need a separate native-API wrapper, not the «just swap baseURL» shortcut.

### Files preserved verbatim (no changes in Phase 4)

- `src/lib/visual-search/openai.ts` — 246 LOC, GPT-4o-mini vision + `text-embedding-3-small` wrapper
- `src/lib/visual-search/classifier.ts` — 40 LOC
- `src/lib/visual-search/indexer.ts` — 220 LOC
- `src/lib/visual-search/searcher.ts` — 290 LOC
- `src/lib/visual-search/config.ts` — 66 LOC, gate via `VISUAL_SEARCH_ENABLED`

### Runtime behavior in Phase 4 (chat surfaces migrated, visual search untouched)

- `VISUAL_SEARCH_ENABLED=false` (current state) — visual search routes return 503 via existing `assertVisualSearchEnabled()`. No user-facing change.
- If at any point `VISUAL_SEARCH_ENABLED=true` is set, the code still uses OpenAI for the vision/embeddings path — `src/lib/visual-search/openai.ts` reads `OPENAI_API_KEY` directly, independent of `AI_PROVIDER`. **`OPENAI_API_KEY` must remain in env for this fallback to work.**

### env.ts refine for visual search — preserved

```typescript
.refine(
  (e) => !e.VISUAL_SEARCH_ENABLED || Boolean(e.OPENAI_API_KEY),
  "OPENAI_API_KEY is required when VISUAL_SEARCH_ENABLED=true"
)
```

Stays as-is — visual search hardwired to OpenAI until Phase N. Future Yandex visual-search refactor will extend this.

### Post-launch implementation plan (filed as 🟡 `VISUAL-SEARCH-YANDEX-MIGRATION` backlog)

**Spike phase (~half-day):**

1. Authenticate to Yandex AI Studio `multimodels-request` endpoint
2. Submit 6 sample beauty photos (one per category: manicure / pedicure / lashes / brows / makeup / hairstyle)
3. Validate classification quality + extract per-request cost
4. Decide: feasible, stay OpenAI for vision, or use Yandex Vision (OCR + classification) for limited use

**Implementation phase (~1-2 days if spike positive):**

1. Schema migration: `vector(1536)` → `vector(256)` for `media_asset_embeddings.embedding` column
2. Update hardcoded `EMBEDDING_DIMENSIONS = 1536` → `256` in 3 files:
   - `src/lib/visual-search/openai.ts:13`
   - `src/lib/visual-search/searcher.ts:20`
   - `src/lib/visual-search/indexer.ts:18`
3. Refactor `src/lib/visual-search/openai.ts` to use the Yandex AI Studio multimodal endpoint (likely native API + raw `fetch`, NOT the OpenAI-compat layer — vision unsupported there)
4. Update `src/lib/visual-search/classifier.ts` if Yandex JSON output format differs (use native `response_format: { type: "json_schema", json_schema: {...} }` per Phase 2 finding)
5. `indexer.ts` + `searcher.ts` business logic unchanged — only the underlying model call swaps
6. Re-test end-to-end on a small dataset (10-20 photos)
7. Set `VISUAL_SEARCH_ENABLED=true` after smoke pass

---

## 5. Rollout sequence

Implementation broken into 5 sequential Phase 4 prompts + 2 optional. Each self-contained, can be paused / reordered if needed.

### Phase 4a — AI-WRAPPER-SWAP-A (~30 min)

**Scope:** infrastructure only. Default `AI_PROVIDER=openai` preserves baseline.

**Files modified:**
- `src/lib/ai/client.ts` (provider-aware client + model resolver, per Section 3 File 1)
- `src/lib/ai/config.ts` (new `getCurrentAIProvider()` export, per File 2)
- `src/lib/env.ts` (3 new vars + refine update, per File 3)
- `.env.example` + `.env.production.example` (documentation blocks, per Files 4-5)
- `src/lib/ai/client.test.ts` (NEW, optional 6-8 tests per File 6)

**Validation:**
- `npm run typecheck` ✅
- `npm run test` ✅ (existing 638 tests untouched; +6-8 new if optional test file added)
- `npm run check:schema-drift` ✅ (no schema change)
- `npm run check:context-freshness` ✅ (header date current)
- Manual: set `AI_PROVIDER=yandex` in `.env.local` with stub key → verify env validation refine fires correctly

**Exit criteria:** infrastructure ready. Default behavior unchanged. No user-facing impact.

### Phase 4b — AI-REVIEW-SUMMARY-MIGRATE-A (~30 min + validation)

**Code change:** ZERO. `review-summary.ts` already calls `aiChat()` and inherits the wrapper switch.

**Action:**
1. Set `AI_PROVIDER=yandex` + `YANDEX_API_KEY` + `YANDEX_FOLDER_ID` in **dev** environment only
2. Clear Redis cache: `ai:review-summary:*` keys (force regeneration so existing OpenAI-generated content doesn't mask quality differences)
3. Quality validation per Section 6:
   - Select 5-10 providers with ≥3 reviews each (real data, varied review distributions)
   - Trigger review-summary for each via dev environment (`GET /api/public/providers/[id]/review-summary`)
   - Compare against captured OpenAI baseline (run same providers with `AI_PROVIDER=openai` first, snapshot outputs)
4. Score per Section 6 criteria; decide proceed / iterate / hold

**Exit criteria:** ≥80% quality parity OR documented iteration plan.

### Phase 4c — AI-REVIEW-REPLY-MIGRATE-A (~30 min + validation)

**Code change:** ZERO.

**Action:**
1. Same env setting as 4b (still in dev)
2. No cache to clear (review-reply is one-off per request, not cached)
3. Quality validation: 5-10 sample reviews (varied ratings + lengths) → trigger suggest-reply → compare
4. Decide proceed / iterate / hold

### Phase 4d — AI-SERVICE-DESCRIPTION-MIGRATE-A (~30 min + validation)

**Code change:** ZERO.

**Action:**
1. Same env setting
2. Sample 5-10 service definitions (varied categories: manicure, hair, makeup) → trigger suggest-description → compare
3. Decide

### Phase 4e — AI-ADVISOR-MIGRATE-A (~half-day)

**Code change:** ZERO at first.

**Action:**
1. Sample 10-15 master profiles with varied stats (new master / established / VIP-rich / low-rating-recovery scenarios)
2. Run advisor through both providers via `GET /api/master/advisor`
3. Rigorous comparison — this is business-context advice, quality matters most
4. If Lite quality regression on >20% of samples: per-surface model override
   - Add `aiChat({ ..., model: 'gpt://<folder>/yandexgpt/latest' })` ONLY in `src/lib/advisor/ai-advice.ts` (Pro model URI)
   - This is the per-surface flexibility the wrapper already supports (Section 3 noted)
   - Cost impact: ~50 advisor calls/day × 1K tokens × 0.80₽/1K = ~40₽/day = ~1200₽/month, vs ~10₽/day on Lite. Still cheap, but track
5. Cache: respect existing advisor cache layer (already TTL-bound, will refresh naturally)

**Exit criteria:** quality parity OR documented per-surface model upgrade decision.

### Phase 4f — Visual search DEFER

No action this sprint. Filed as 🟡 `VISUAL-SEARCH-YANDEX-MIGRATION` post-launch backlog item.

### Production rollout (after dev/staging validation)

After Phases 4b-4e pass in dev:

1. Set `AI_PROVIDER=yandex` + `YANDEX_API_KEY` + `YANDEX_FOLDER_ID` in **production** env
2. Redeploy (or runtime reload depending on host)
3. Clear Redis `ai:review-summary:*` cache in production (one-time invalidation for clean baseline)
4. Monitor for 1 week per Section 8 metrics
5. **Keep `OPENAI_API_KEY` in prod env** — rollback path

---

## 6. Quality validation strategy

### Approach: parallel sampling with scoring

For each chat surface (review-summary / review-reply / service-description / advisor):

1. **Capture sample inputs** — 5-15 realistic prompts (real data preferred; seed data acceptable for dev runs)
2. **Run through both providers** — first OpenAI baseline (snapshot), then Yandex (compare)
3. **Side-by-side review** — both outputs visible together for each input
4. **Score per criteria** (1-5 scale, 5 = best):
   - **Russian language quality:** natural phrasing / grammar / native-feel vs awkward / errors
   - **Task adherence:** addresses the prompt OR drifts off-topic
   - **Tone match:** business-appropriate per prompt instructions (warm + professional for reply, copywriter-tone for description, etc)
   - **Factual accuracy:** when applicable (advisor stats interpretation)
   - **Length compliance:** respects the prompt's «2-3 sentences» / «3-4 sentences» instruction
5. **Decision matrix:**

   | Avg score | Action |
   |---|---|
   | ≥4.0 (80%+) | Migration proceeds for this surface |
   | 3.0-4.0 (60-80%) | Tune prompts under YandexGPT (one prompt-engineering iteration), retest |
   | <3.0 | Flag surface — consider Pro model OR keep OpenAI for this surface |

### Optional tooling: `scripts/compare-ai-providers.mjs`

Filed as separate 🟡 `AI-QUALITY-VALIDATION-SCRIPT-A` backlog item (~1 hr).

**Behavior:**
- Reads a YAML/JSON file of sample prompts
- Calls both providers via `aiChat()` with provider override
- Writes a Markdown table to stdout with side-by-side outputs
- Optionally writes to file for asynchronous human review

**Pseudo-API:**

```bash
node scripts/compare-ai-providers.mjs --surface=review-summary --samples=10
# → outputs comparison.md with input / OpenAI output / Yandex output rows
```

Not required for Phase 4 (manual sampling is sufficient), but accelerates iteration if quality issues surface.

---

## 7. Fallback / graceful degradation

### Scenario A: Yandex API unreachable

**Current behavior of `aiChat()`:**
- Throws → calling service catches via try/catch (`src/lib/advisor/engine.ts:32` is the canonical example)
- Calling service returns `null` OR logs error and continues with deterministic fallback (advisor rules-only insights, etc)
- User-facing impact: AI-generated section absent OR shows "could not generate, try again"

**Migration preserves this behavior** — no automatic provider failover at runtime. Dual-provider runtime complexity adds bugs faster than it adds resilience.

**Recovery procedure:**
1. Detect via observability (Sentry / log monitoring — backlog item `OBSERVABILITY-SENTRY-A`)
2. Operator sets `AI_PROVIDER=openai` in prod env
3. Redeploy OR runtime reload
4. AI surfaces resume via OpenAI baseline
5. Total recovery time: minutes (env-only change, no code involved)

### Scenario B: Yandex quality regression in production

**Detection:**
- User reports / support tickets
- Monitoring metrics if Sentry/APM eventually installed
- Spot-check of generated outputs

**Mitigation:**
- Immediate: `AI_PROVIDER=openai` toggle → instant reversion
- Permanent: prompt rewriting under YandexGPT OR per-surface model upgrade (Lite → Pro)

### Scenario C: Rate limit / quota exceeded

**Current OpenAI rate-limit handling** (`src/lib/ai/client.ts:47-58`):
- Status 429 → `trackError("openai:rate-limit")` + Telegram alert if 5+ in a minute
- Status 402 (balance exhausted) → Telegram alert immediately

**Yandex behavior expected to mirror** (OpenAI-compat endpoint emits OpenAI-shape errors per Phase 2 research). Same handler should work; **verify in Phase 4a** that Yandex 429 / 402 status codes propagate through the compat layer.

**Telegram alert template — update for clarity:**

```diff
- "⚠️ OpenAI rate limit — AI features замедлены"
+ "⚠️ AI rate limit (provider: <name>) — AI features замедлены"
```

(Use `getCurrentAIProvider()` for attribution.)

### Recovery runbook (filed as 🟡 `AI-PROVIDER-FAILOVER-RUNBOOK-A` ~30 min)

**Will document in `docs/runbooks/ai-provider-failover.md`:**

| Symptom | Detection | Mitigation |
|---|---|---|
| AI surfaces return empty/error | Sentry / user reports | Switch `AI_PROVIDER` to other provider, redeploy |
| Quality regression | Spot-check / reports | Toggle env, file prompt-tuning task |
| 429 rate limit | Telegram alert | Wait OR upgrade account tier |
| 402 balance | Telegram alert | Top up Yandex Cloud account OR switch to OpenAI |
| Unknown 5xx | Log noise | Toggle provider, escalate to Yandex support |

---

## 8. Success metrics

### During migration (each Phase 4 sub-step)

- ✅ `npm run typecheck` clean
- ✅ `npm run lint` baseline preserved (1 error / 3 warnings from PHASE7)
- ✅ All existing 638 tests pass (regression-free); new wrapper tests pass if added
- ✅ `npm run build` succeeds
- ✅ `npm run check` aggregate clean (all 11 gates including new `check:schema-drift`)
- ✅ Quality score ≥4.0/5.0 average per surface (Section 6 validation)
- ✅ No new error patterns in dev logs after 24h of `AI_PROVIDER=yandex` use

### Post-migration (production stability check)

- ✅ `AI_PROVIDER=yandex` runs stable for 1 week without incident
- ✅ Monthly Yandex cost holds within projection (~1,100-2,600₽ per Phase 2 estimate)
- ✅ Zero user complaints attributable to AI feature quality regression
- ✅ Operational simplification confirmed (no more VPN/proxy dependency for OpenAI access from RU)
- ✅ Telegram rate-limit alerts not spiking (would indicate quota issues)

### Rollback triggers (operator decision authority)

- 🚨 **>5% AI surface error rate** (HTTP errors OR quality complaints) → `AI_PROVIDER=openai`
- 🚨 **Cost spike >2× projection** → investigate prompt token efficiency before reverting (cost still likely lower than OpenAI even at 2x)
- 🚨 **User complaint volume** about AI quality (≥3 distinct complaints in 48h on same surface) → reassess that specific surface

---

## 9. Visual search migration plan (post-launch reference)

See Section 4 for the deferral rationale. Detailed post-launch implementation in the backlog item `VISUAL-SEARCH-YANDEX-MIGRATION`:

### Spike phase (~half-day)

1. Provision Yandex Cloud account access (if not already)
2. Test `aistudio.yandex.ru/.../multimodels-request` endpoint with 6 sample beauty photos (one per category)
3. Document: which model is used, per-request cost, classification quality vs current OpenAI gpt-4o-mini vision

### Decision tree post-spike

- **Quality good + cost reasonable:** proceed to implementation (~1-2 days)
- **Quality poor:** stay on OpenAI for visual search OR investigate Yandex Vision OCR + custom downstream classifier (if 6 beauty categories can be modeled)
- **Cost prohibitive:** defer indefinitely; visual search remains OpenAI-only

### Implementation phase (~1-2 days if spike positive)

1. **Schema migration:** `prisma/schema/media.prisma` — change `vector(1536)` → `vector(256)`. Create migration via `npx prisma migrate dev --name reduce_embedding_dimensions_for_yandex`. ADD-only style? No — this is a column type change. Verify carefully via `prisma migrate diff --script` before apply. **DB still has 0 vectors stored** so no data-loss risk.
2. **Update hardcoded dimensions** in 3 files (`EMBEDDING_DIMENSIONS = 1536` → `256`):
   - `src/lib/visual-search/openai.ts:13`
   - `src/lib/visual-search/searcher.ts:20`
   - `src/lib/visual-search/indexer.ts:18`
3. **Refactor `src/lib/visual-search/openai.ts`** to use the Yandex AI Studio multimodal endpoint via native API (raw `fetch`, NOT OpenAI compat — vision not supported there)
4. **Update `src/lib/visual-search/classifier.ts`** to use native `response_format: { type: "json_schema", json_schema: {...} }` per Phase 2 finding
5. **`indexer.ts` + `searcher.ts`** business logic unchanged (only underlying model call swaps)
6. **End-to-end smoke** on 10-20 photos
7. **Enable** via `VISUAL_SEARCH_ENABLED=true`

### Files unchanged by visual-search migration

- `src/lib/visual-search/contracts.ts` — DTO contract (provider-agnostic)
- `src/lib/visual-search/category-registry.ts` — category metadata (provider-agnostic)
- `src/lib/visual-search/prompt.ts` — prompt strings (may need re-tuning under different model)

---

## Phase 4-N implementation prompts queued

Filed as discrete BACKLOG items, each self-contained and orderable:

| # | Item | Estimated effort | Dependencies |
|---|---|---|---|
| 4a | `AI-WRAPPER-SWAP-A` | ~30 min | none (foundation) |
| 4b | `AI-REVIEW-SUMMARY-MIGRATE-A` | ~30 min + validation | 4a |
| 4c | `AI-REVIEW-REPLY-MIGRATE-A` | ~30 min + validation | 4a |
| 4d | `AI-SERVICE-DESCRIPTION-MIGRATE-A` | ~30 min + validation | 4a |
| 4e | `AI-ADVISOR-MIGRATE-A` | ~half-day | 4a |
| — | `AI-PROVIDER-FAILOVER-RUNBOOK-A` (optional) | ~30 min | parallel-safe |
| — | `AI-QUALITY-VALIDATION-SCRIPT-A` (optional) | ~1 hr | 4a |
| post-launch | `VISUAL-SEARCH-YANDEX-MIGRATION` | ~half-day spike + ~1-2 days impl | none (independent) |

**Total estimated focused effort for 4 chat surfaces:** ~3-4 hours including validation.

---

## Honest TBDs (require Phase 4 verification)

1. **Yandex compat endpoint response shape exact match** — Phase 2 research says yes (OpenAI-compatible) but verify the first live call returns `response.choices[0].message.content` at the same path
2. **`max_tokens` + `temperature` parameter pass-through** — assume yes (OpenAI-compat means standard params), but verify in 4a smoke
3. **Model URI format via compat layer** — `gpt://<folder>/yandexgpt-lite/latest` per Phase 2 research; smoke-test that the compat endpoint accepts this as the `model` field
4. **Error response shape** — confirm 429/402/5xx status codes propagate through compat layer so `isRetryable()` + Telegram alerts keep working unchanged
5. **JSON output mode via compat layer** — Phase 2 found native API supports `response_format: json_schema`, but the OpenAI-compat layer may not pass it through. **Only matters if visual-search ever shipped** — defer verification to that phase

---

## Open questions for user (Phase 3 closure)

None blocking. Plan is complete and Phase 4a can start whenever convenient. Estimated wall-clock for all 5 sub-phases (4a–4e): one focused half-day of work plus validation samples.

If you want a different baseline model for advisor (Pro instead of Lite from day one), say so before Phase 4e — otherwise we start on Lite per the «lowest-risk first» principle and upgrade per-surface only if quality validation requires it.
