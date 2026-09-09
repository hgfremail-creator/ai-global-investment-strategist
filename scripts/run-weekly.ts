// Run the weekly review for every portfolio (local dev / cron alternative).
// Usage: npm run cron:weekly [-- --times N]
import { prisma } from "../src/lib/db";
import { runWeeklyReview } from "../src/services/weeklyReview";

const arg = process.argv.indexOf("--times");
const times = arg > -1 ? Math.max(1, Number(process.argv[arg + 1])) : 1;

const portfolios = await prisma.portfolio.findMany({ select: { id: true, name: true } });
for (const p of portfolios) {
  for (let i = 0; i < times; i++) {
    const r = await runWeeklyReview(p.id, { force: true });
    console.log(
      `${p.name}: strategy v${r.version} (week of ${r.weekOf}) — ${r.rows} positions, ` +
        `recs ${r.recommendations ? (r.recommendations.usedFallback ? "fallback" : "AI") : "n/a"}`,
    );
  }
}
await prisma.$disconnect();
