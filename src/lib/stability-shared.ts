// Types and rules shared by the stability page (client) and its data loader
// (server). No database imports here.

// How many of the most recent executions of each case are analysed.
export const STABILITY_WINDOW = 10;

export type RunOutcome = "passed" | "failed" | "blocked" | "skipped";

export type HistoryPoint = {
  runId: string;
  runName: string;
  status: RunOutcome;
  executedAt: string;
};

// Each case lands in at most one category, checked in this order:
//  - flaky:            passed and failed in the window, switching at least twice
//  - always_failing:   3+ executions in the window and none passed
//  - recently_broken:  the last execution failed right after one that passed
//  - stable:           anything else
export type StabilityCategory = "flaky" | "always_failing" | "recently_broken" | "stable";

export type CaseStability = {
  id: string;
  code: string | null;
  title: string;
  suiteName: string;
  automated: boolean;
  category: StabilityCategory;
  history: HistoryPoint[]; // oldest → newest, last STABILITY_WINDOW runs
  executions: number; // in the whole history
  passRate: number; // % passed in the window (skipped not counted)
  flips: number; // pass↔fail switches in the window
  failStreak: number; // failed/blocked in a row at the end
  medianDurationMs: number | null;
  lastError: string | null;
  // Open defects linked to the case, or a failure message that says it's a
  // known defect ("DEFECTO: …"): the test is fine, the app is what fails.
  openDefects: number;
  knownDefect: boolean;
  lastFailure: { runId: string; runName: string; executedAt: string } | null;
};

export type StabilityData = {
  cases: CaseStability[];
  // Automated cases with timings, slowest median first.
  slow: CaseStability[];
};

export const isFail = (s: RunOutcome) => s === "failed" || s === "blocked";

export function classify(history: RunOutcome[]): {
  category: StabilityCategory;
  flips: number;
  failStreak: number;
  passRate: number;
} {
  const decided = history.filter((s) => s !== "skipped");
  let flips = 0;
  for (let i = 1; i < decided.length; i++) {
    if (isFail(decided[i]) !== isFail(decided[i - 1])) flips++;
  }
  let failStreak = 0;
  for (let i = decided.length - 1; i >= 0 && isFail(decided[i]); i--) failStreak++;
  const passed = decided.filter((s) => s === "passed").length;
  const passRate = decided.length ? Math.round((passed / decided.length) * 100) : 0;

  let category: StabilityCategory = "stable";
  if (passed > 0 && passed < decided.length && flips >= 2) category = "flaky";
  else if (decided.length >= 3 && passed === 0) category = "always_failing";
  else if (failStreak >= 1 && decided.length > failStreak) category = "recently_broken";
  return { category, flips, failStreak, passRate };
}
