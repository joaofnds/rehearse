import { describe, expect, it } from "bun:test";

import { parseConfirmationGroupRecord } from "./confirmation-record";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

/**
 * Every rep installs the same frozen corpus against the same map, so the
 * group records the rule and what one install of it redirects.
 */
async function recordsTheDeliveryRuleAndRedirectCountOnTheGroup(): Promise<void> {
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
		(base) => ({
			...base,
			liveCitations: async () =>
				await Promise.resolve({
					home: "/home/user",
					roots: [
						{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" },
					],
				}),
		}),
	);

	const outcome = await runReplayConfirmation(dependencies, request);

	const group = parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);
	expect(group.inputs.corpusDelivery).toEqual({ redirected: 1, rule: 1 });
}

describe(runReplayConfirmation.name, () => {
	it(
		"records the delivery rule and redirect count on the group",
		recordsTheDeliveryRuleAndRedirectCountOnTheGroup,
	);
});
