import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { updateAttempts } from "#benchmark/session-comparison-attempt-record-fixture";
import { writeManifest } from "#benchmark/session-comparison-group-test-fixture";
import { sessionGroupFile } from "#benchmark/session-comparison-record-test-fixture";
import { comparisonSuiteRoot } from "#benchmark/session-comparison-workspace-fixture";
import { recordOutput } from "#cli/cli-test-support";
import runCompare from "#cli/compare-command";

const root = comparisonSuiteRoot();

async function namesOnStderrTheArmThatReadAFileUnderTestLive(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	await updateAttempts(
		sessionGroupFile({ caseId: "case-two", role: "baseline", runsDirectory }),
		(attempt) => ({
			...attempt,
			corpusDelivery: {
				liveReads: [{ count: 1, path: "skills/build/SKILL.md" }],
				redirected: 0,
				rule: 1,
			},
		}),
	);
	const recorder = recordOutput();

	await runCompare(
		{ json: false, manifestPath, runsDirectory },
		recorder.output,
	);

	expect(recorder.stderr).toEqual([
		"case case-two arm baseline read files under test through the live install, so it measured the live copy of: skills/build/SKILL.md (2 calls)\n",
	]);
}

describe(runCompare.name, () => {
	it(
		"names on stderr the arm that read a file under test live",
		namesOnStderrTheArmThatReadAFileUnderTestLive,
	);
});
