import { afterEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import {
	RUN,
	RunRecordBuilder,
	renderRunDetail,
} from "#client/test-support/run-detail";

import {
	originalFetch,
	renderBuildReport,
	stepReport,
	stoppedWithBuildFigures,
} from "./step-report-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the selected step in Results", () => {
	describe("step report", () => {
		it(
			"reads each instruction file the stage read with its hash and whether it changed since the run",
			readsEachInstructionFileTheStageReadWithItsHashAndWhetherItChangedSinceTheRun,
		);

		it(
			"reads the instructions a stage read as not recorded when its reads are unavailable",
			readsTheInstructionsAStageReadAsNotRecordedWhenItsReadsAreUnavailable,
		);

		it(
			"reads a figure the records lack as not recorded with its reason",
			readsAFigureTheRecordsLackAsNotRecordedWithItsReason,
		);

		it(
			"reads the cost a record lacks part of as each part, not a partial sum",
			readsTheCostARecordLacksPartOfAsEachPartNotAPartialSum,
		);

		it(
			"reads an old stop's transcript link as not recorded",
			readsAnOldStopSTranscriptLinkAsNotRecorded,
		);

		it(
			"says a judge or session it could not read, without an alert",
			saysAJudgeOrSessionItCouldNotReadWithoutAnAlert,
		);

		it("links the stage's transcript on disk", linksTheStageSTranscriptOnDisk);

		it(
			"styles nothing on a stopped run as an error",
			stylesNothingOnAStoppedRunAsAnError,
		);
	});
});

async function readsEachInstructionFileTheStageReadWithItsHashAndWhetherItChangedSinceTheRun(): Promise<void> {
	renderBuildReport();

	const report = await stepReport();
	const rows = within(
		within(report).getByRole("table", {
			name: "Instructions this step read",
		}),
	).getAllByRole("row");

	expect(rows.map((row) => row.textContent)).toEqual([
		"PathHashSince this run",
		"skills/implement/SKILL.mda41c7e✓unchanged",
		"skills/review/SKILL.md9f30d1⚠changed since this run",
		"CLAUDE.md77aa01not compared · a project file is not part of the corpus",
		"CLAUDE.mdno hashnot compared · no hash was recorded",
		"skills/plan/SKILL.md5be0c2not compared · the corpus under test cannot compare it",
	]);
}

async function readsTheInstructionsAStageReadAsNotRecordedWhenItsReadsAreUnavailable(): Promise<void> {
	renderBuildReport({
		record: new RunRecordBuilder(stoppedWithBuildFigures())
			.withStage({
				readManifest: {
					reasons: ["the stage recorded no reads"],
					state: "unavailable",
				},
				stage: "build",
			})
			.build(),
	});

	const report = await stepReport();

	expect(
		await within(report).findByText(
			"Instructions read not recorded: the stage recorded no reads",
		),
	).toBeInTheDocument();
}

async function readsAFigureTheRecordsLackAsNotRecordedWithItsReason(): Promise<void> {
	renderBuildReport({
		record: new RunRecordBuilder(stoppedWithBuildFigures())
			.withStage({
				stage: "build",
				wallTime: {
					reasons: ["the stage record has no elapsed time"],
					state: "unavailable",
				},
			})
			.build(),
		session: { spans: [], state: "closed" },
	});

	const report = await stepReport();

	expect(
		await within(report).findByText(
			"skills/implement/SKILL.md · wall time not recorded: the stage record has no elapsed time · $1.12 · transcript not recorded: Rehearse kept no copy of this step's session",
		),
	).toBeInTheDocument();
}

async function readsTheCostARecordLacksPartOfAsEachPartNotAPartialSum(): Promise<void> {
	renderBuildReport({
		record: new RunRecordBuilder(stoppedWithBuildFigures())
			.withStage({
				sessionCost: {
					reasons: ["the provider reported no session cost"],
					state: "unavailable",
				},
				stage: "build",
			})
			.build(),
	});

	const report = await stepReport();

	expect(
		await within(report).findByText(
			/session cost not recorded: the provider reported no session cost · judge \$0\.12/u,
		),
	).toBeInTheDocument();
}

async function readsAnOldStopSTranscriptLinkAsNotRecorded(): Promise<void> {
	renderBuildReport({
		record: stoppedWithBuildFigures(),
		session: {
			spans: [],
			state: "closed",
		},
	});

	const report = await stepReport();

	expect(
		await within(report).findByText(
			"Session on disk: not recorded: Rehearse kept no copy of this step's session",
		),
	).toBeInTheDocument();
	expect(within(report).queryByRole("link")).toBeNull();
}

async function saysAJudgeOrSessionItCouldNotReadWithoutAnAlert(): Promise<void> {
	renderRunDetail(
		new Map<string, unknown>([[`/api/runs/${RUN}`, stoppedWithBuildFigures()]]),
	);

	const report = await screen.findByRole("region", {
		name: "Step report",
	});

	expect(
		await within(report).findByText("Could not read this step's judge."),
	).toBeInTheDocument();
	expect(
		await within(report).findByText(
			/transcript not read: could not read this step's session/u,
		),
	).toBeInTheDocument();
	expect(within(report).queryByRole("alert")).toBeNull();
}

async function linksTheStageSTranscriptOnDisk(): Promise<void> {
	renderBuildReport();

	const report = await stepReport();

	expect(
		await within(report).findByRole("link", {
			name: `.benchmark-runs/${RUN}.build.session/transcript.jsonl`,
		}),
	).toHaveAttribute("href", `/runs/${RUN}/stages/build`);
}

async function stylesNothingOnAStoppedRunAsAnError(): Promise<void> {
	const expectedQuerySelectorAllCount = 0;

	renderBuildReport();

	await stepReport();
	const rail = screen.getByRole("region", { name: "Run workspace" });

	expect(
		rail?.querySelectorAll(
			'[class*="destructive"], [class*="danger"], [role="alert"]',
		),
	).toHaveLength(expectedQuerySelectorAllCount);
}
