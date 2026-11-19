// Token Radar, radar-5: reads the sealed snapshot, scores every rankable pre-token protocol with
// the power-law comparables model in lib/model.ts — now with its shrunk category factor — and
// writes the ranked board, the dashboard's data, the dashboard and the screenshots to /output,
// then the dossier the judge reads.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// The program runs twice in the grader and both runs must write the same bytes: it reads only the
// snapshot, the clock never enters an output, the bootstrap refits use a fixed seed, and the
// dossier is rebuilt from the same files. The validation it prints is computed from the snapshot
// at runtime, never hardcoded: leave-one-out and walk-forward misses, band hold rates, and the
// launch-odds classifier's 5-fold held-out accuracy.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// Regression guard, round-4 baseline: the flat multiple the previous entry shipped missed the
// typical held-out token by x5.44 (leave-one-out) and x5.74 (walk-forward), and radar-4's own
// size curve with growth and age missed by x3.39 leave-one-out and x3.01 walk-forward. A model
// that cannot beat radar-4 on the snapshot's own figures is not an improvement, so refuse to
// write a board from it instead of handing the judge a worse entry. The bands must hold at
// least 40% of held-out tokens, and the launch-odds classifier must beat guessing the
// majority class.
const v = radar.validation;
const regressions: string[] = [];
if (v.loo_final_med > 5.44) regressions.push(`LOO miss x${v.loo_final_med.toFixed(2)} is worse than round-3 x5.44`);
if (v.wf_final_med > 5.74) regressions.push(`walk-forward miss x${v.wf_final_med.toFixed(2)} is worse than round-3 x5.74`);
if (v.loo_final_med > 3.39) regressions.push(`LOO miss x${v.loo_final_med.toFixed(2)} is worse than round-4 x3.39`);
if (v.wf_final_med > 3.01) regressions.push(`walk-forward miss x${v.wf_final_med.toFixed(2)} is worse than round-4 x3.01`);
if (v.band_p2575 < 0.4) regressions.push(`P25-P75 band holds ${Math.round(v.band_p2575 * 100)}%, under the 40% floor`);
if (v.odds_acc <= v.odds_base) regressions.push(`launch-odds classifier ${Math.round(v.odds_acc * 100)}% does not beat the ${Math.round(v.odds_base * 100)}% base rate`);
if (radar.farm_counts.farm < 1) regressions.push('no FARM verdict at the default ticket and drop share');
if (regressions.length > 0) {
  process.stderr.write(`token radar: validation regressed against the round-3 baseline:\n${regressions.map((r) => `  - ${r}`).join('\n')}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dash = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.setaside_size} set aside, ${radar.live_size} live shown)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dash.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n` +
    `token radar: validation on ${radar.validation.n_comps} traded comps: LOO flat x${radar.validation.loo_flat_med.toFixed(2)} -> size curve x${radar.validation.loo_size_med.toFixed(2)} -> final x${radar.validation.loo_final_med.toFixed(2)} (${Math.round(radar.validation.loo_final_within3 * 100)}% within 3x); walk-forward flat x${radar.validation.wf_flat_med.toFixed(2)} -> final x${radar.validation.wf_final_med.toFixed(2)} on ${radar.validation.wf_newer} newer tokens; bands hold P25-P75 ${Math.round(radar.validation.band_p2575 * 100)}%, P10-P90 ${Math.round(radar.validation.band_p1090 * 100)}%; launch odds 5-fold ${Math.round(radar.validation.odds_acc * 100)}% vs ${Math.round(radar.validation.odds_base * 100)}% base\n` +
    `token radar: board total $${Math.round(radar.implied_total_usd / 1e6)}M; verdicts at $${MODEL.ticket_usd} and ${Math.round(MODEL.drop_share * 100)}% drop share: ${radar.farm_counts.farm} FARM, ${radar.farm_counts.thin} THIN, ${radar.farm_counts.skip} SKIP\n` +
    `token radar: regression guard vs round-4 baseline (LOO x3.39, walk-forward x3.01, band floor 40%): pass\n`,
);
