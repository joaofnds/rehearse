import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { readGroup } from "./pipeline-confirmation-record-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import { TestResources } from "./test-support";

const FLAG = "DISABLE_PROMPT_CACHING";

const RECORDED_FLAG = {
	name: FLAG,
	sha256: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
};

const testResources = TestResources.forEachTest();

const inheritedFlag = Bun.env[FLAG];

function exportFlag(): void {
	Bun.env[FLAG] = "1";
}

function restoreFlag(): void {
	if (inheritedFlag === undefined) {
		Reflect.deleteProperty(Bun.env, FLAG);
		return;
	}

	Bun.env[FLAG] = inheritedFlag;
}

async function recordsOnAPipelineGroupTheConfigurationItsStagesInherited(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const group = await readGroup(await harness.run({}));

	expect(group.inputs.inheritedConfiguration).toContainEqual(RECORDED_FLAG);
}

async function recordsOnAReplayGroupTheConfigurationItsStagesInherited(): Promise<void> {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);
	const corpusRoot = await new ReplayCorpusBuilder().build(testResources);
	const { dependencies, request } = harness.prepareConfirmation(
		{
			corpusRoots: [{ kind: "directory", root: corpusRoot }],
			paths: run.paths,
		},
		{ reps: 2 },
	);

	const group = await readGroup(
		await runReplayConfirmation(dependencies, request),
	);

	expect(group.inputs.inheritedConfiguration).toContainEqual(RECORDED_FLAG);
}

describe("a confirmation group", () => {
	beforeEach(exportFlag);
	afterEach(restoreFlag);

	it(
		"records the Claude Code configuration its pipeline stages inherited",
		recordsOnAPipelineGroupTheConfigurationItsStagesInherited,
	);

	it(
		"records the Claude Code configuration its replayed stages inherited",
		recordsOnAReplayGroupTheConfigurationItsStagesInherited,
	);
});
