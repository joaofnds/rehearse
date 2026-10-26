import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen } from "@testing-library/react";

import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { RunRecordStage } from "#server/run-record";

import { LaunchDialog } from "./launch-dialog";
import {
	corpusRead,
	gradedPlan,
	reads,
	replayDialogOn,
	replayedBuild,
	upstreamCheckpoint,
} from "./launch-replay-fixtures";
import { openDialog, originalFetch, serving } from "./launch-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(LaunchDialog.name, () => {
	it(
		"names the checkpoint by its short id, the step that recorded it and that step's grade",
		namesTheCheckpointByItsShortIdTheStepThatRecordedItAndThatStepSGrade,
	);
	it(
		"names the initial checkpoint as task setup",
		namesTheInitialCheckpointAsTaskSetup,
	);
	it(
		"names the checkpoint by its step alone when no short id was claimed",
		namesTheCheckpointByItsStepAloneWhenNoShortIdWasClaimed,
	);
	it(
		"names no grade when the recording step has none",
		namesNoGradeWhenTheRecordingStepHasNone,
	);

	describe("when the run and step are chosen in the dialog", () => {
		it(
			"names the chosen step's checkpoint and changed files",
			namesTheChosenStepSCheckpointAndChangedFiles,
		);
		it(
			"names the chosen run's checkpoint and changed files",
			namesTheChosenRunSCheckpointAndChangedFiles,
		);
	});
});

async function namesTheCheckpointByItsShortIdTheStepThatRecordedItAndThatStepSGrade(): Promise<void> {
	await replayDialogOn([gradedPlan(), replayedBuild()]);

	const checkpoint = await screen.findByText(
		"audit-log/r1/s1 · after plan (B+)",
	);

	expect(checkpoint).toBeInTheDocument();
}

async function namesTheInitialCheckpointAsTaskSetup(): Promise<void> {
	await replayDialogOn([
		replayedBuild({
			artifactsIn: upstreamCheckpoint("initial", "audit-log/r1/s0"),
		}),
	]);

	const checkpoint = await screen.findByText("audit-log/r1/s0 · task setup");

	expect(checkpoint).toBeInTheDocument();
}

async function namesTheCheckpointByItsStepAloneWhenNoShortIdWasClaimed(): Promise<void> {
	await replayDialogOn([
		gradedPlan(),
		replayedBuild({ artifactsIn: upstreamCheckpoint("plan") }),
	]);

	const checkpoint = await screen.findByText("after plan (B+)");

	expect(checkpoint).toBeInTheDocument();
}

async function namesNoGradeWhenTheRecordingStepHasNone(): Promise<void> {
	const ungradedPlan = new RunRecordStageBuilder({
		stage: "plan",
		status: "graded",
	}).build();
	await replayDialogOn([ungradedPlan, replayedBuild()]);

	const checkpoint = await screen.findByText("audit-log/r1/s1 · after plan");

	expect(checkpoint).toBeInTheDocument();
}

async function namesTheChosenStepSCheckpointAndChangedFiles(): Promise<void> {
	const plan = gradedPlan({
		artifactsIn: upstreamCheckpoint("initial", "audit-log/r1/s0"),
		readManifest: reads(corpusRead("CLAUDE.md", "unchanged")),
	});
	const build = replayedBuild({
		readManifest: reads(corpusRead("skills/build/SKILL.md", "changed")),
	});
	const source = new RunRecordBuilder({
		run: "source-run",
		stages: [plan, build],
	}).build();
	serving(
		new Map([["GET /api/runs/source-run", { body: source, status: 200 }]]),
	);
	await openDialog({
		kind: "chosen-replay",
		opensOn: { run: "source-run", stage: "plan" },
		runs: [
			{
				caseId: "audit-log",
				openingStage: "plan",
				run: "source-run",
				stages: ["plan", "build"],
			},
		],
	});
	await screen.findByText("audit-log/r1/s0 · task setup");

	fireEvent.change(screen.getByLabelText("Step"), {
		target: { value: "build" },
	});

	expect(
		await screen.findByText("audit-log/r1/s1 · after plan (B+)"),
	).toBeInTheDocument();
	expect(
		await screen.findByText("· 1 file changed since ckpt"),
	).toBeInTheDocument();
}

function servingRuns(
	runs: readonly (readonly [string, readonly RunRecordStage[]])[],
): void {
	serving(
		new Map(
			runs.map(([run, stages]) => [
				`GET /api/runs/${run}`,
				{ body: new RunRecordBuilder({ run, stages }).build(), status: 200 },
			]),
		),
	);
}

async function namesTheChosenRunSCheckpointAndChangedFiles(): Promise<void> {
	const unchanged = reads(corpusRead("CLAUDE.md", "unchanged"));
	const changed = reads(corpusRead("skills/build/SKILL.md", "changed"));
	servingRuns([
		["first-run", [gradedPlan(), replayedBuild({ readManifest: unchanged })]],
		[
			"second-run",
			[
				gradedPlan(),
				replayedBuild({
					artifactsIn: upstreamCheckpoint("plan", "audit-log/r2/s1"),
					readManifest: changed,
				}),
			],
		],
	]);
	await openDialog({
		kind: "chosen-replay",
		opensOn: { run: "first-run", stage: "build" },
		runs: ["first-run", "second-run"].map((run) => ({
			caseId: "audit-log",
			openingStage: "build",
			run,
			stages: ["plan", "build"],
		})),
	});
	await screen.findByText("audit-log/r1/s1 · after plan (B+)");

	fireEvent.change(screen.getByLabelText("Run"), {
		target: { value: "second-run" },
	});

	expect(
		await screen.findByText("audit-log/r2/s1 · after plan (B+)"),
	).toBeInTheDocument();
	expect(
		await screen.findByText("· 1 file changed since ckpt"),
	).toBeInTheDocument();
}
