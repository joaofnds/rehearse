import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
	GATEWAY_A,
	GATEWAY_B,
	compareCollectingNotices,
} from "./comparison-inherited-configuration-test-fixture";
import { COMPARISON_ARMS } from "./comparison-record";
import { updateAttempts } from "./session-comparison-attempt-record-fixture";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { sessionGroupFile } from "./session-comparison-record-test-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function namesTheVariablesTwoArmsSessionsInheritedDifferently(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	await Array.fromAsync(COMPARISON_ARMS, async (role) => {
		await updateAttempts(
			sessionGroupFile({ caseId: "case-two", role, runsDirectory }),
			(attempt) => ({
				...attempt,
				setup: {
					inheritedConfiguration: role === "control" ? GATEWAY_B : GATEWAY_A,
					kind: "isolated",
				},
			}),
		);
	});

	const { notices } = await compareCollectingNotices(
		manifestPath,
		runsDirectory,
	);

	expect(notices).toEqual([
		"case case-two arms baseline and control inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL (different values)",
		"case case-two arms candidate and control inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL (different values)",
	]);
}

async function namesTheArmWhoseSessionsPredateRecordingIt(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	await updateAttempts(
		sessionGroupFile({ caseId: "case-one", role: "baseline", runsDirectory }),
		(attempt) => ({ ...attempt, setup: { kind: "isolated" } }),
	);

	const { notices } = await compareCollectingNotices(
		manifestPath,
		runsDirectory,
	);

	expect(notices).toEqual([
		"case case-one arm baseline recorded no Claude Code configuration inherited from the shell that started them, so whether every arm ran with the same configuration is unknown",
	]);
}

describe("a session comparison", () => {
	it(
		"names the variables two arms' sessions inherited differently",
		namesTheVariablesTwoArmsSessionsInheritedDifferently,
	);

	it(
		"names the arm whose sessions predate recording what they inherited",
		namesTheArmWhoseSessionsPredateRecordingIt,
	);
});
