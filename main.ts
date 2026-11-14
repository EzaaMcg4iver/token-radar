// Token launch radar: read the sealed DefiLlama snapshot, rank the pre-token
// protocols by the radar-2 model, and write the board, the dashboard data,
// the dashboard and screenshots, and finally the dossier.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
//
// The output directory comes from MAKEFUN_OUTPUT_DIR and defaults to /output.
// The snapshot comes from --input, else /input/snapshot.json. The program
// refuses to run when the snapshot is missing or the board fails its own
// gate checks (coverage, ranks, ordering, distinct values, farm steps).

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, buildLive, MODEL_VERSION } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function usageError(message: string): never {
  throw new Error(`token-radar: ${message}`);
}

function inputPath(argv: string[]): string {
  const at = argv.indexOf('--input');
  if (at >= 0 && argv[at + 1]) return argv[at + 1];
  return '/input/snapshot.json';
}

function checkBoard(rows: ReturnType<typeof buildBoard>, watchlist: string[]): void {
  if (rows.length < 100 || rows.length > 4000) {
    usageError(`board holds ${rows.length} rows, outside 100 to 4000`);
  }
  const seenRanks = new Set<number>();
  const seenValues = new Set<number>();
  const seenSlugs = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (!Number.isInteger(row.rank) || row.rank < 1) usageError(`row ${row.slug} has a bad rank`);
    if (seenRanks.has(row.rank)) usageError(`rank ${row.rank} appears twice`);
    seenRanks.add(row.rank);
    if (row.implied_value_usd > previous) usageError(`implied value rises at rank ${row.rank}`);
    previous = row.implied_value_usd;
    if (seenValues.has(row.implied_value_usd)) {
      usageError(`implied value ${row.implied_value_usd} appears twice`);
    }
    seenValues.add(row.implied_value_usd);
    if (seenSlugs.has(row.slug)) usageError(`slug ${row.slug} appears twice`);
    seenSlugs.add(row.slug);
    if (!row.name) usageError(`row ${row.slug} has no name`);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      usageError(`row ${row.slug} has a bad implied value`);
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      usageError(`row ${row.slug} has ${row.farm_steps.length} farm steps`);
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        usageError(`row ${row.slug} has a farm step of ${trimmed.length} characters`);
      }
    }
  }
  for (let rank = 1; rank <= rows.length; rank++) {
    if (!seenRanks.has(rank)) usageError(`rank ${rank} is missing`);
  }
  for (const slug of watchlist) {
    if (!seenSlugs.has(slug)) usageError(`watchlist slug ${slug} is missing from the board`);
  }
}

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function main(): void {
  const input = inputPath(process.argv.slice(2));
  if (!existsSync(input)) usageError(`snapshot not found: ${input}`);
  const snapshot = JSON.parse(readFileSync(input, 'utf8'));
  if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
    usageError('snapshot is not shaped like a snapshot');
  }

  const rows = buildBoard(snapshot);
  checkBoard(rows, snapshot.watchlist);
  const live = buildLive(snapshot);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });

  const board = {
    model: MODEL_VERSION,
    as_of: snapshot.as_of,
    rows,
    live,
  };
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(board, null, 2)}\n`, 'utf8');
  const data = { model: MODEL_VERSION, as_of: snapshot.as_of, rows, live };
  writeFileSync(join(outDir, 'data.js'), `window.RADAR_DATA = ${JSON.stringify(data)};\n`, 'utf8');

  copyTree(join(REPO_ROOT, 'dashboard'), join(outDir, 'dashboard'));
  copyTree(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'));

  // The dossier is written last of all, from the finished output directory.
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log(
    `${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${rows.length} rows scored (${live.length} live set aside)`,
  );
}

main();
