import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { measureCorpusVersion } from "./corpus-version";
import {
	RecordedRunsFixture,
	directorySource,
} from "./run-records-test-support";
import {
	HALF_WRITTEN_UUID,
	NEWER,
	OLDER,
	SMOKE_ATTEMPT,
} from "./staleness-record-test-fixtures";
import { sessionAttemptStaleness } from "./staleness-report";
import SessionCorpusFixtures from "./staleness-session-test-fixtures";

const fixtures = new SessionCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function answersForEachAttemptOnItsOwnWithItsDistance(): Promise<void> {
	const corpus = await fixtures.styleCorpus("some older style\n");
	const root = await fixtures.temporaryDirectory("rehearse-case-two-");
	const fixture = new RecordedRunsFixture(root);
	const older = await measureCorpusVersion(root, directorySource(corpus));
	await fixture.sessions.writeAttemptAt(OLDER, {
		caseId: "smoke",
		corpusRoot: corpus,
		corpusVersion: older,
		layoutPaths: ["output-styles/brief.md"],
	});
	await Bun.write(
		join(corpus, "output-styles", "brief.md"),
		"the brief style\n",
	);
	const newer = await measureCorpusVersion(root, directorySource(corpus));
	await fixture.sessions.writeAttemptAt(NEWER, {
		caseId: "smoke",
		corpusRoot: corpus,
		corpusVersion: newer,
		layoutPaths: ["output-styles/brief.md"],
	});

	const report = await sessionAttemptStaleness(root, directorySource(corpus));

	expect(
		report.records
			.map(({ id, stale, distance }) => ({ distance, id, stale }))
			.toSorted((left, right) => left.id.localeCompare(right.id)),
	).toEqual([
		{
			distance: { kind: "measured", versions: 1 },
			id: `attempt:session:smoke/${OLDER}`,
			stale: true,
		},
		{
			distance: { kind: "measured", versions: 0 },
			id: `attempt:session:smoke/${NEWER}`,
			stale: false,
		},
	]);
}

async function namesItAsUnreadableAndStillAnswersForTheOtherAttempt(): Promise<void> {
	const corpus = await fixtures.styleCorpus("the brief style\n");
	const runsDirectory = await fixtures.runsWithSmokeAttempt(corpus);
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.sessions.writeUnreadableAttempt({
		caseId: "smoke",
		uuid: HALF_WRITTEN_UUID,
	});

	const report = await sessionAttemptStaleness(
		runsDirectory,
		directorySource(await fixtures.styleCorpus("the brief style, edited\n")),
	);

	expect(report.records.map(({ id }) => id)).toEqual([SMOKE_ATTEMPT]);
	expect(report.unreadable.map(({ id }) => id)).toEqual([
		`attempt:session:smoke/${HALF_WRITTEN_UUID}`,
	]);
}

async function reportsNoRecordBecauseNothingWasMeasured(): Promise<void> {
	const root = await fixtures.temporaryDirectory("rehearse-case-none-");

	const report = await sessionAttemptStaleness(
		root,
		directorySource(await fixtures.styleCorpus("the brief style\n")),
	);

	expect(report.records).toEqual([]);
}

describe(sessionAttemptStaleness.name, () => {
	describe("when a case has two attempts measured at two versions", () => {
		it(
			"answers for each attempt on its own, with its distance",
			answersForEachAttemptOnItsOwnWithItsDistance,
		);
	});
	describe("when one attempt record cannot be read", () => {
		it(
			"names it as unreadable and still answers for the other attempt",
			namesItAsUnreadableAndStillAnswersForTheOtherAttempt,
		);
	});
	describe("when a case has no recorded attempt", () => {
		it(
			"reports no record, because nothing was measured",
			reportsNoRecordBecauseNothingWasMeasured,
		);
	});
});
