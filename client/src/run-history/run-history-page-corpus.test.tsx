import { describe, expect, it } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import { unversionedStaleness } from "#client/test-support/run-figures";

import RunHistoryPage from "./run-history-page";
import FinishedHistoryBuilder from "./run-history-page-finished-history-builder";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

async function testNamesTheCauseWhenARowIsStaleForOneReason(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				corpusVersion: { digest: "a3a62f", kind: "version" },
				grade: "B",
				run: "2026-09-06T21-58-29.508Z",
				stage: "shape",
				staleness: unversionedStaleness({
					causes: ["CLAUDE.md changed"],
					stale: true,
				}),
				status: "STOPPED:build",
			}).build(),
		],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("CLAUDE.md changed")).toBeInTheDocument();
	});
}

async function testShowsTheBadgeAndTheCauseInTheCorpusCellForAStaleRowThatRecordedNoCheckpointStageWithNoPill(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				run: "2026-09-05T00-00-00.000Z",
				staleness: unversionedStaleness({
					causes: ["upstream stage initial is stale"],
					stale: true,
				}),
				status: "INTERRUPTED",
			}).build(),
		],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("stale")).toBeInTheDocument();
	});
	expect(
		screen.getByText("upstream stage initial is stale"),
	).toBeInTheDocument();
	expect(screen.queryByText(/^corpus@/u)).not.toBeInTheDocument();
	expect(
		cellOf({ column: "Corpus", run: "2026-09-05T00-00-00.000Z" }),
	).not.toHaveTextContent("—");
}

async function testSaysTheCorpusChangedDuringARunWhoseStagesMeasuredDifferentVersions(): Promise<void> {
	const [first] = new FinishedHistoryBuilder().build().rows;
	respondingWith({
		launches: [],
		rows:
			first?.kind === "run" ? [{ ...first, corpusChangedDuringRun: true }] : [],
		unreadable: [],
	});

	await renderPage().findByText("2026-09-06T21-58-29.508Z");

	expect(
		cellOf({ column: "Corpus", run: "2026-09-06T21-58-29.508Z" }),
	).toHaveTextContent("corpus@a3a62f");
	expect(
		cellOf({ column: "Corpus", run: "2026-09-06T21-58-29.508Z" }),
	).toHaveTextContent("corpus changed during the run");
}

async function testRendersARunWithNoRecordedCheckpointAsRecordingNoCorpusVersion(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				run: "2026-09-05T00-00-00.000Z",
				staleness: unversionedStaleness({ causes: [], stale: false }),
				status: "STOPPED:discuss",
			}).build(),
		],
		unreadable: [],
	});

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("2026-09-05T00-00-00.000Z")).toBeInTheDocument();
	});
	expect(screen.queryByText(/^corpus@/u)).not.toBeInTheDocument();
	expect(
		cellOf({ column: "Corpus", run: "2026-09-05T00-00-00.000Z" }),
	).toHaveTextContent("version not recorded");
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	it(
		"names the cause when a row is stale for one reason",
		testNamesTheCauseWhenARowIsStaleForOneReason,
	);

	it(
		"shows the badge and the cause in the corpus cell for a stale row that recorded no checkpoint stage, with no pill",
		testShowsTheBadgeAndTheCauseInTheCorpusCellForAStaleRowThatRecordedNoCheckpointStageWithNoPill,
	);

	it(
		"says the corpus changed during a run whose stages measured different versions",
		testSaysTheCorpusChangedDuringARunWhoseStagesMeasuredDifferentVersions,
	);

	it(
		"renders a run with no recorded checkpoint as recording no corpus version",
		testRendersARunWithNoRecordedCheckpointAsRecordingNoCorpusVersion,
	);
});
