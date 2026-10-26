import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import type { RunRecordStage } from "#server/run-record";

import { LaunchDialog } from "./launch-dialog";
import {
	CORPUS_LINE,
	corpusRead,
	corpusRow,
	gradedPlan,
	projectRead,
	reads,
	replayDialogOn,
	replayedBuild,
	uncomparedRead,
} from "./launch-replay-fixtures";
import { openDialog, originalFetch, serving } from "./launch-test-fixtures";

interface MarkerCase {
	readonly case: string;
	readonly manifest: RunRecordStage["readManifest"];
	readonly marker: string;
}

const MARKER_CASES: MarkerCase[] = [
	{
		case: "marks one changed file the replayed step read",
		manifest: reads(
			corpusRead("skills/build/SKILL.md", "changed"),
			corpusRead("CLAUDE.md", "unchanged"),
		),
		marker: "· 1 file changed since ckpt",
	},
	{
		case: "counts several changed files",
		manifest: reads(
			corpusRead("skills/build/SKILL.md", "changed"),
			corpusRead("CLAUDE.md", "changed"),
		),
		marker: "· 2 files changed since ckpt",
	},
	{
		case: "counts a file read twice once",
		manifest: reads(corpusRead("skills/build/SKILL.md", "changed"), {
			...corpusRead("skills/build/SKILL.md", "changed"),
			role: "stage skill",
		}),
		marker: "· 1 file changed since ckpt",
	},
	{
		case: "leaves out project files",
		manifest: reads(
			corpusRead("CLAUDE.md", "unchanged"),
			projectRead("AGENTS.md"),
		),
		marker: "",
	},
	{
		case: "carries no marker when every read was compared and none changed",
		manifest: reads(corpusRead("CLAUDE.md", "unchanged")),
		marker: "",
	},
	{
		case: "says changed files are not known when the step recorded no reads",
		manifest: {
			reasons: ["the stage recorded no reads"],
			state: "unavailable",
		},
		marker: "· changed files not known: the stage recorded no reads",
	},
	{
		case: "says changed files are not known when some reads were not compared",
		manifest: reads(
			corpusRead("CLAUDE.md", "unchanged"),
			uncomparedRead("skills/build/SKILL.md"),
		),
		marker: "· changed files not known: 1 file not compared",
	},
	{
		case: "counts the changed files beside the ones not compared",
		manifest: reads(
			corpusRead("CLAUDE.md", "changed"),
			uncomparedRead("skills/build/SKILL.md"),
		),
		marker: "· 1 file changed since ckpt, 1 file not compared",
	},
];

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(LaunchDialog.name, () => {
	describe("on a step replay's corpus row", () => {
		it.each(MARKER_CASES)("$case", marksTheCorpusRow);
		it(
			"says changed files are not known when the corpus could not be judged",
			saysChangedFilesAreNotKnownWhenTheCorpusCouldNotBeJudged,
		);
		it(
			"says changed files are not known when the source run cannot be read",
			saysChangedFilesAreNotKnownWhenTheSourceRunCannotBeRead,
		);
	});
});

async function marksTheCorpusRow({
	manifest,
	marker,
}: MarkerCase): Promise<void> {
	await replayDialogOn([
		gradedPlan(),
		replayedBuild({ readManifest: manifest }),
	]);

	const row = await corpusRow();

	await waitFor(() => {
		expect(row.textContent).toBe(`${CORPUS_LINE}${marker}`);
	});
}

async function saysChangedFilesAreNotKnownWhenTheCorpusCouldNotBeJudged(): Promise<void> {
	const unchanged = reads(corpusRead("CLAUDE.md", "unchanged"));
	await replayDialogOn([
		gradedPlan(),
		replayedBuild({
			readManifest: unchanged,
			readManifestJudgment: {
				reasons: ["the corpus under test could not be read"],
				state: "unavailable",
			},
		}),
	]);

	const marker = await screen.findByText(
		"· changed files not known: the corpus under test could not be read",
	);

	expect(marker).toBeInTheDocument();
}

async function saysChangedFilesAreNotKnownWhenTheSourceRunCannotBeRead(): Promise<void> {
	serving(
		new Map([
			["GET /api/runs/source-run", { body: { error: "gone" }, status: 404 }],
		]),
	);
	await openDialog({ kind: "replay", run: "source-run", stage: "build" });

	const marker = await screen.findByText(
		"· changed files not known: the source run could not be read",
	);

	expect(marker).toBeInTheDocument();
}
