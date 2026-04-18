import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import fs from "node:fs";

const BASE_URL = process.env.LIGHTHOUSE_BASE_URL ?? "http://localhost:3000";
const MASTER_SLUG = process.env.LIGHTHOUSE_MASTER_SLUG ?? "test-master";

const PAGES = [
  { name: "Homepage", path: "/" },
  { name: "Catalog", path: "/catalog" },
  { name: "Login", path: "/login" },
  { name: "Pricing", path: "/pricing" },
  { name: "Master Profile", path: `/u/${MASTER_SLUG}` },
  { name: "Models", path: "/models" },
  { name: "FAQ", path: "/faq" },
  { name: "Master Cabinet", path: "/cabinet/master" },
  { name: "Studio Cabinet", path: "/cabinet/studio" },
];

const TARGETS: Record<string, number> = {
  "Homepage": 90,
  "Catalog": 90,
  "Login": 95,
  "Pricing": 95,
  "Master Profile": 90,
  "Models": 90,
  "FAQ": 95,
  "Master Cabinet": 80,
  "Studio Cabinet": 80,
};

interface PageResult {
  path: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  metrics: {
    FCP: string | undefined;
    LCP: string | undefined;
    CLS: string | undefined;
    TBT: string | undefined;
    SI: string | undefined;
  };
  target: number;
  pass: boolean;
}

async function run() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
  });

  const results: Record<string, PageResult> = {};

  for (const page of PAGES) {
    console.log(`\nAuditing ${page.name} (${page.path})...`);

    try {
      const result = await lighthouse(`${BASE_URL}${page.path}`, {
        port: chrome.port,
        output: "json",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        formFactor: "mobile",
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 812,
          deviceScaleFactor: 3,
          disabled: false,
        },
      });

      const lhr = result?.lhr;
      const categories = lhr?.categories;
      const perf = Math.round((categories?.performance?.score ?? 0) * 100);
      const target = TARGETS[page.name] ?? 90;

      results[page.name] = {
        path: page.path,
        performance: perf,
        accessibility: Math.round((categories?.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((categories?.["best-practices"]?.score ?? 0) * 100),
        seo: Math.round((categories?.seo?.score ?? 0) * 100),
        metrics: {
          FCP: lhr?.audits?.["first-contentful-paint"]?.displayValue,
          LCP: lhr?.audits?.["largest-contentful-paint"]?.displayValue,
          CLS: lhr?.audits?.["cumulative-layout-shift"]?.displayValue,
          TBT: lhr?.audits?.["total-blocking-time"]?.displayValue,
          SI: lhr?.audits?.["speed-index"]?.displayValue,
        },
        target,
        pass: perf >= target,
      };

      const r = results[page.name];
      const status = r.pass ? "✅" : "❌";
      console.log(`  ${status} Performance: ${r.performance} (target: ${target})`);
      console.log(`     FCP: ${r.metrics.FCP ?? "n/a"} | LCP: ${r.metrics.LCP ?? "n/a"} | CLS: ${r.metrics.CLS ?? "n/a"} | TBT: ${r.metrics.TBT ?? "n/a"}`);
    } catch (err) {
      console.error(`  ⚠️  Failed to audit ${page.name}:`, (err as Error).message);
    }
  }

  fs.writeFileSync("lighthouse-report.json", JSON.stringify(results, null, 2));
  console.log("\n\nReport saved to lighthouse-report.json\n");

  console.log("=== РЕЗУЛЬТАТЫ ===\n");
  console.table(
    Object.entries(results).map(([name, r]) => ({
      "Page": name,
      "Perf": `${r.performance}${r.pass ? " ✅" : " ❌"}`,
      "A11y": r.accessibility,
      "BP": r.bestPractices,
      "SEO": r.seo,
      "LCP": r.metrics.LCP ?? "n/a",
      "CLS": r.metrics.CLS ?? "n/a",
      "TBT": r.metrics.TBT ?? "n/a",
    }))
  );

  const failed = Object.entries(results).filter(([, r]) => !r.pass);
  if (failed.length) {
    console.log(`\n❌ ${failed.length} page(s) below target:\n`);
    for (const [name, r] of failed) {
      console.log(`  ${name}: ${r.performance} (target: ${r.target})`);
    }
    process.exitCode = 1;
  } else {
    console.log("\n✅ All pages meet performance targets!");
  }

  await chrome.kill();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
