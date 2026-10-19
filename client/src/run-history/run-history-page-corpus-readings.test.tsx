import { describe, expect, it } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import type { RowStaleness } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import CorpusEditBuilder from "./run-history-page-corpus-edit-builder";
import StalenessHistoryBuilder from "./run-history-page-staleness-history-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

const CORPUS_STALENESS_READINGS = [
	[
		"clean at the version under test",
		{
			causes: [],
			changedFiles: [],
			distance: { kind: "measured", versions: 0 },
			onlyCorpusFiles: false,
			stale: false,
			state: "available",
		} satisfies RowStaleness,
		"✓clean",
	],
	[
		"stale one version back when only a file it read changed",
		new CorpusEditBuilder({ versions: 1 }).build(),
		"⚠stale · corpus changed since",
	],
	[
		"superseded two or more versions back when only files it read changed",
		new CorpusEditBuilder({ versions: 3 }).build(),
		"⚠superseded · 3 versions back",
	],
	[
		"superseded from exactly two versions back",
		new CorpusEditBuilder({ versions: 2 }).build(),
		"⚠superseded · 2 versions back",
	],
	[
		"stale one version back when its upstream stage went stale from the same file edit",
		{
			...new CorpusEditBuilder({ versions: 1 }).build(),
			causes: [
				"skills/build/SKILL.md changed",
				"upstream stage shape is stale",
			],
		},
		"⚠stale · corpus changed since",
	],
	[
		"stale, not clean, at the version under test when a setting changed",
		{
			causes: ["model sonnet is now opus"],
			changedFiles: [],
			distance: { kind: "measured", versions: 0 },
			onlyCorpusFiles: false,
			stale: true,
			state: "available",
		} satisfies RowStaleness,
		"⚠stale",
	],
] as const;

async function testKeepsTheStaleBadgeAndNamesTheCauseWhenSomethingBesidesACorpusFileMadeTheRecordStale(): Promise<void> {
	respondingWith(
		new StalenessHistoryBuilder({
			rows: [
				{
					name: "2026-09-06T00-00-00.000Z",
					staleness: {
						...new CorpusEditBuilder({ versions: 1 }).build(),
						causes: ["model sonnet is now opus"],
						changedFiles: [],
						onlyCorpusFiles: false,
					},
				},
			],
		}).build(),
	);

	renderPage();

	await waitFor(() => {
		expect(screen.getByText("model sonnet is now opus")).toBeInTheDocument();
	});
	expect(
		cellOf({ column: "Corpus", run: "2026-09-06T00-00-00.000Z" }),
	).toHaveTextContent("⚠stale");
	expect(
		cellOf({ column: "Corpus", run: "2026-09-06T00-00-00.000Z" }),
	).not.toHaveTextContent("corpus changed since");
}

async function testKeepsThePlainStaleBadgeWhenASettingsFileChangedAlongsideACorpusFile(): Promise<void> {
	respondingWith(
		new StalenessHistoryBuilder({
			rows: [
				{
					name: "2026-09-06T00-00-00.000Z",
					staleness: {
						...new CorpusEditBuilder({ versions: 1 }).build(),
						causes: ["skills/build/SKILL.md changed", "settings.json changed"],
						onlyCorpusFiles: false,
					},
				},
			],
		}).build(),
	);

	renderPage();

	await waitFor(() => {
		expect(
			cellOf({ column: "Corpus", run: "2026-09-06T00-00-00.000Z" }),
		).toHaveTextContent("⚠stale");
	});
	expect(
		cellOf({ column: "Corpus", run: "2026-09-06T00-00-00.000Z" }),
	).not.toHaveTextContent("corpus changed since");
}

async function testSaysWhyARecordSStalenessCouldNotBeJudged(): Promise<void> {
	respondingWith(
		new StalenessHistoryBuilder({
			rows: [
				{
					name: "2026-09-06T00-00-00.000Z",
					staleness: {
						reasons: ["the group froze no pipeline to hash its stages against"],
						state: "unavailable",
					},
				},
			],
		}).build(),
	);

	renderPage();

	await waitFor(() => {
		expect(
			screen.getByText(
				"the group froze no pipeline to hash its stages against",
			),
		).toBeInTheDocument();
	});
}

async function testReadsCorpusStaleness(
	_scenario: string,
	staleness: RowStaleness,
	reading: string,
): Promise<void> {
	respondingWith(
		new StalenessHistoryBuilder({
			rows: [{ name: "2026-09-06T00-00-00.000Z", staleness }],
		}).build(),
	);

	renderPage();

	await waitFor(() => {
		expect(
			cellOf({ column: "Corpus", run: "2026-09-06T00-00-00.000Z" }),
		).toHaveTextContent(reading);
	});
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the corpus column's judgment of a record against the corpus under test", () => {
		it.each(CORPUS_STALENESS_READINGS)("reads %s", testReadsCorpusStaleness);

		it(
			"keeps the stale badge and names the cause when something besides a corpus file made the record stale",
			testKeepsTheStaleBadgeAndNamesTheCauseWhenSomethingBesidesACorpusFileMadeTheRecordStale,
		);

		it(
			"keeps the plain stale badge when a settings file changed alongside a corpus file",
			testKeepsThePlainStaleBadgeWhenASettingsFileChangedAlongsideACorpusFile,
		);

		it(
			"says why a record's staleness could not be judged",
			testSaysWhyARecordSStalenessCouldNotBeJudged,
		);
	});
});
