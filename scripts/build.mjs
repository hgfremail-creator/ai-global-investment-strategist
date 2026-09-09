// Cross-platform production build wrapper.
// Preloads the readlink shim (see scripts/fs-readlink-shim.cjs) into every
// Node process Next spawns, then runs `next build`.
import { spawnSync } from "node:child_process";

// NODE_OPTIONS is whitespace-split by Node and offers no quoting, so the preload
// path must contain no spaces. A CWD-relative path keeps it safe even when the
// project lives under a directory with spaces. npm runs this from the project root.
const env = { ...process.env };
env.NODE_OPTIONS = [env.NODE_OPTIONS, "--require=./scripts/fs-readlink-shim.cjs"]
  .filter(Boolean)
  .join(" ");

const gen = spawnSync("prisma", ["generate"], { stdio: "inherit", shell: true, env });
if (gen.status !== 0) process.exit(gen.status ?? 1);

const res = spawnSync("next", ["build", "--turbopack"], {
  stdio: "inherit",
  shell: true,
  env,
});
process.exit(res.status ?? 1);
