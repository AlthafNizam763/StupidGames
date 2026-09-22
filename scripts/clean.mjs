import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Removes build outputs before a build. Run as `prebuild` in each workspace.
 *
 * This exists because of a silent failure, not for tidiness.
 *
 * `shared` is a composite TypeScript project, so `tsc` keeps a
 * `tsconfig.tsbuildinfo` recording what it has already emitted. Delete `dist`
 * and leave that file behind, and the next build compares timestamps against a
 * manifest that says everything is current, emits nothing, and **exits zero**.
 * The build reports success and produces no output; the failure only appears
 * later, as every import of `@voidline/shared` failing to resolve.
 *
 * That is reachable from an ordinary `rm -rf dist`, and more importantly from
 * a CI cache that restores `.tsbuildinfo` without restoring `dist`. A build
 * that succeeds while producing nothing is the worst available outcome, so the
 * two are now always removed together.
 *
 * Node's own `rmSync` rather than a dependency, because this has to run on
 * Windows and Linux and `rm -rf` is not portable.
 */

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error('clean: nothing to remove - pass at least one path');
  process.exit(1);
}

for (const target of targets) {
  rmSync(resolve(process.cwd(), target), { recursive: true, force: true });
}
