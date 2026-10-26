import { screen, within } from "@testing-library/react";

import type { Immutable } from "#benchmark/contracts";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { RunRecordStage } from "#server/run-record";

import { openDialog, serving } from "./launch-test-fixtures";

type ReadEntry = Extract<
	RunRecordStage["readManifest"],
	{ readonly state: "available" }
>["entries"][number];

/** The current corpus version as the corpus row draws it, before any marker. */
const CORPUS_LINE = "corpus@a41c7ecurrent linked corpus";

function corpusRead(
	path: string,
	state: NonNullable<ReadEntry["state"]>,
): Immutable<ReadEntry> {
	return {
		evidence: "declared",
		half: "corpus",
		path,
		role: "read for context",
		sha256: "a".repeat(SHA256_HEX_CHARACTERS),
		state,
	};
}

/** A corpus read the server could not compare with the corpus under test. */
function uncomparedRead(path: string): Immutable<ReadEntry> {
	return {
		evidence: "declared",
		half: "corpus",
		path,
		role: "read for context",
	};
}

function projectRead(path: string): Immutable<ReadEntry> {
	return {
		evidence: "observed",
		half: "project",
		path,
		role: "project instructions",
		state: "changed",
	};
}

function reads(
	...entries: readonly Immutable<ReadEntry>[]
): RunRecordStage["readManifest"] {
	return { entries, state: "available" };
}

function upstreamCheckpoint(
	upstream: string,
	shortId?: string,
): RunRecordStage["artifactsIn"] {
	return {
		entries: [
			{
				checkpointShortId:
					shortId === undefined
						? { reasons: ["no short id was claimed"], state: "unavailable" }
						: { shortId, state: "available" },
				from: "upstream checkpoint",
				target: "acme-api",
				upstream,
			},
		],
		missing: [],
	};
}

/** A step the judge graded B+, which the next step's checkpoint names. */
function gradedPlan(
	props: Immutable<Partial<RunRecordStage>> = {},
): RunRecordStage {
	return new RunRecordStageBuilder({
		grade: {
			letter: "B+",
			reachesMinimum: true,
			state: "available",
			verdict: "continue",
		},
		stage: "plan",
		status: "graded",
		...props,
	}).build();
}

/** The replayed build step, restoring plan's checkpoint, with what it read. */
function replayedBuild(
	props: Immutable<Partial<RunRecordStage>> = {},
): RunRecordStage {
	return new RunRecordStageBuilder({
		artifactsIn: upstreamCheckpoint("plan", "audit-log/r1/s1"),
		stage: "build",
		...props,
	}).build();
}

/** Serves a source run of these stages and opens the replay of its build step. */
async function replayDialogOn(
	stages: readonly RunRecordStage[],
): Promise<HTMLElement> {
	const source = new RunRecordBuilder({ run: "source-run", stages }).build();
	serving(
		new Map([["GET /api/runs/source-run", { body: source, status: 200 }]]),
	);

	return await openDialog({
		kind: "replay",
		run: "source-run",
		stage: "build",
	});
}

/** The reading beside the dialog's Corpus label, once the source run is read. */
async function corpusRow(): Promise<HTMLElement> {
	const dialog = await screen.findByRole("dialog");
	const conditions = await within(dialog).findByRole("region", {
		name: "Launch conditions",
	});
	await within(conditions).findByText("claude-opus-4");
	const row = within(dialog).getByText("Corpus", {
		selector: "dt",
	}).nextElementSibling;
	if (!(row instanceof HTMLElement)) {
		throw new Error("the corpus label has no reading beside it");
	}

	return row;
}

export {
	CORPUS_LINE,
	corpusRead,
	corpusRow,
	gradedPlan,
	projectRead,
	reads,
	replayDialogOn,
	replayedBuild,
	uncomparedRead,
	upstreamCheckpoint,
};
