// Lightweight terminal logger for seed scripts. Avoids pulling in chalk —
// the few colour codes we want fit in a single file. The runtime is `tsx`
// (Node) so ANSI escapes work everywhere except piped CI output, which
// gracefully ignores them.

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

export const logSeed = {
  start(title: string) {
    console.log(`\n${ANSI.bold}${ANSI.cyan}=== ${title} ===${ANSI.reset}\n`);
  },
  section(title: string) {
    console.log(`\n${ANSI.bold}${title}${ANSI.reset}`);
  },
  step(message: string) {
    console.log(`  ${ANSI.dim}→${ANSI.reset} ${message}`);
  },
  ok(message: string) {
    console.log(`  ${ANSI.green}✓${ANSI.reset} ${message}`);
  },
  warn(message: string) {
    console.log(`  ${ANSI.yellow}!${ANSI.reset} ${message}`);
  },
  error(message: string) {
    console.log(`  ${ANSI.red}✗${ANSI.reset} ${message}`);
  },
  summary(stats: Record<string, number>) {
    console.log(`\n${ANSI.bold}=== Summary ===${ANSI.reset}`);
    const longestKey = Math.max(...Object.keys(stats).map((k) => k.length));
    for (const [key, value] of Object.entries(stats)) {
      console.log(`  ${key.padEnd(longestKey + 2)} ${ANSI.bold}${value}${ANSI.reset}`);
    }
    console.log("");
  },
};
