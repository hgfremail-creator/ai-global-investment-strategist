// End-to-end immutability check: snapshot every existing strategy version, run a
// weekly review, then assert none of the prior versions / recommendations /
// reports / risk metrics / stress tests were mutated. Exits non-zero on failure.
import { prisma } from "../src/lib/db";
import { runWeeklyReview } from "../src/services/weeklyReview";

function hash(obj: unknown): string {
  return JSON.stringify(obj);
}

async function snapshot(portfolioId: string) {
  const versions = await prisma.strategyVersion.findMany({
    where: { portfolioId },
    include: { recommendations: true, riskMetric: true, stressTests: true, researchReport: true, changes: true },
    orderBy: { version: "asc" },
  });
  return new Map(versions.map((v) => [v.version, hash(v)]));
}

const portfolio = await prisma.portfolio.findFirst();
if (!portfolio) {
  console.error("no portfolio — run npm run db:seed first");
  process.exit(1);
}

const before = await snapshot(portfolio.id);
console.log(`Snapshot: ${before.size} existing version(s).`);

const res = await runWeeklyReview(portfolio.id, { force: true });
console.log(`Ran weekly review → strategy v${res.version}.`);

const after = await snapshot(portfolio.id);

let failures = 0;
for (const [version, sig] of before) {
  const now = after.get(version);
  if (now !== sig) {
    failures++;
    console.error(`❌ Strategy v${version} was MUTATED by the weekly review.`);
  } else {
    console.log(`✅ Strategy v${version} unchanged.`);
  }
}

await prisma.$disconnect();
if (failures > 0) {
  console.error(`\n${failures} immutability violation(s).`);
  process.exit(1);
}
console.log("\nAll prior versions immutable. ✔");
