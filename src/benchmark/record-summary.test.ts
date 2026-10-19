import { describe, expect, it } from "bun:test";

import { runSummary } from "./record-summary";
import {
	QUOTED_FINAL_RECORD,
	QUOTED_STAGE_RECORD,
	RUN_RECORD,
} from "./record-summary-run-test-fixtures";

function rendersTheStagesTheirGradesTheVerdictAndTheTotalCost(): void {
	expect(runSummary("2026-09-03T00-00-00.000Z", RUN_RECORD)).toBe(
		`## run:2026-09-03T00-00-00.000Z

Case audit-log, status COMPLETE.

| stage | grade | verdict | cost |
| --- | --- | --- | --- |
| discuss | A | CONTINUE | $1.00 |
| build | B | CONTINUE | $2.00 |

Final verdict PASS.
Total cost $11.75.
`,
	);
}

function listsEachJudgedItemSEvidenceWithItsQuoteAndLocator(): void {
	const record = QUOTED_STAGE_RECORD;

	expect(runSummary("run-1", record)).toContain(`### build evidence

- unfinished-delivery PASS: checks pass (local-checks harness). Harness result localChecks.
- scope PASS: the module is wired (diff src/app.ts). Quote "import { AuditLog }" at src/app.ts @@ -1,2 +1,3 @@, 2 occurrences.
- clarity B: the task is clear (task backlog-seed.md). Recorded before quoted spans.
`);
}

function listsTheFinalJudgeSEvidenceReadingAnOldItemAsRecordedBeforeQuotedSpans(): void {
	const record = QUOTED_FINAL_RECORD;

	expect(runSummary("run-1", record)).toContain(`### final judge evidence

- tests PASS: the log is tested (diff src/audit.test.ts). Quote "it('records a change')" at src/audit.test.ts @@ -0,0 +1,9 @@.
- worker PASS: the worker followed the rules (baseline-context CLAUDE.md). Recorded before quoted spans.
`);
}

describe(runSummary.name, () => {
	it(
		"renders the stages, their grades, the verdict, and the total cost",
		rendersTheStagesTheirGradesTheVerdictAndTheTotalCost,
	);
	it(
		"lists each judged item's evidence with its quote and locator",
		listsEachJudgedItemSEvidenceWithItsQuoteAndLocator,
	);
	it(
		"lists the final judge's evidence, reading an old item as recorded before quoted spans",
		listsTheFinalJudgeSEvidenceReadingAnOldItemAsRecordedBeforeQuotedSpans,
	);
});
