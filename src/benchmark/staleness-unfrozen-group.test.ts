import { afterEach, describe, expect, it } from "bun:test";

import {
	RecordedRunsFixture,
	directorySource,
} from "./run-records-test-support";
import ConfirmationCorpusFixtures from "./staleness-group-test-fixtures";
import { groupStaleness } from "./staleness-report";

const fixtures = new ConfirmationCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function namesTheGroupUnreadableRatherThanJudgingIt(): Promise<void> {
	const fixture = new RecordedRunsFixture(
		await fixtures.temporaryDirectory("rehearse-group-no-pipeline-"),
	);
	await fixture.write();

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(await fixtures.stageCorpus()),
	);

	expect(report).toEqual({
		records: [],
		unreadable: [
			{
				id: `group:${fixture.groupId}`,
				reason: "the group froze no pipeline to hash its stages against",
			},
		],
	});
}

describe(groupStaleness.name, () => {
	describe("when a stage group froze no pipeline", () => {
		it(
			"names the group unreadable rather than judging it",
			namesTheGroupUnreadableRatherThanJudgingIt,
		);
	});
});
