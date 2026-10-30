import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { parseConfirmationGroupRecord } from "./confirmation-record";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import type { ReplayDependencyOverride } from "./replay-confirmation-test-support";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

const rulebookCitations = {
	home: "/home/user",
	roots: [{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" }],
};

/** The stage session keeps the skill text it found installed. */
function citingRun(keep: (text: string) => void): ReplayDependencyOverride {
	return (base) => ({
		...base,
		liveCitations: async () => await Promise.resolve(rulebookCitations),
		stageSession: {
			...base.stageSession,
			runWorkflowStage: async (request) => {
				keep(
					await Bun.file(
						join(request.targetDir, ".claude/skills/discuss/SKILL.md"),
					).text(),
				);

				return await base.stageSession.runWorkflowStage(request);
			},
		},
	});
}

async function runCitingConfirmation(): Promise<{
	readonly installed: readonly string[];
	readonly outcome: Awaited<ReturnType<typeof runReplayConfirmation>>;
}> {
	const installed: string[] = [];
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);
	const corpus = await new ReplayCorpusBuilder({
		files: [
			{
				content: "Follow /home/user/.agents/rulebook/ownership.md.\n",
				path: "skills/discuss/SKILL.md",
			},
			{ content: "the arm's rule\n", path: "rulebook/ownership.md" },
		],
	}).build(testResources);
	const { dependencies, request } = harness.prepareConfirmation(
		{ corpusRoots: [{ kind: "directory", root: corpus }], paths: run.paths },
		{ reps: 2 },
		citingRun((text: string) => {
			installed.push(text);
		}),
	);

	const outcome = await runReplayConfirmation(dependencies, request);

	return { installed, outcome };
}

async function deliversTheCitationsToEveryRepsInstall(): Promise<void> {
	const { installed } = await runCitingConfirmation();

	expect(installed).toEqual([
		"Follow .claude/rulebook/ownership.md.\n",
		"Follow .claude/rulebook/ownership.md.\n",
	]);
}

/**
 * Every rep installs the same frozen corpus against the same map, so the
 * group records the rule and what one install of it redirects.
 */
async function recordsTheDeliveryRuleAndRedirectCountOnTheGroup(): Promise<void> {
	const { outcome } = await runCitingConfirmation();

	const group = parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);
	expect(group.inputs.corpusDelivery).toEqual({ redirected: 1, rule: 1 });
}

describe(runReplayConfirmation.name, () => {
	it(
		"delivers the citations to every rep's install",
		deliversTheCitationsToEveryRepsInstall,
	);

	it(
		"records the delivery rule and redirect count on the group",
		recordsTheDeliveryRuleAndRedirectCountOnTheGroup,
	);
});
