import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
} from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	corpusDirectory,
	fullCorpusDirectory,
} from "#server/corpus-report-workspace-test-fixture";

import { corpusReport } from "./corpus-report";

afterEach(clearCorpusReportRoots);

describe(corpusReport.name, () => {
	it(
		"reports only the corpus layout, never a file beside it in the root",
		verifyReportsOnlyTheCorpusLayoutNeverAFileBeside,
	);

	it.each([
		{ holding: "two lines ending in a newline", lines: 2, text: "one\ntwo\n" },
		{ holding: "a last line with no newline", lines: 2, text: "one\ntwo" },
		{ holding: "one empty line", lines: 1, text: "\n" },
		{ holding: "nothing", lines: 0, text: "" },
	])(
		"counts $lines lines in a file holding $holding, as an editor shows them",
		async ({ text, lines }) => {
			const root = await fullCorpusDirectory();
			await writeFile(join(root, "CLAUDE.md"), text);
			const runs = await corpusDirectory();
			await new RecordedRunsFixture(runs).write();

			const report = await corpusReport(directorySource(root), runs);

			expect(report.files.find(({ path }) => path === "CLAUDE.md")?.lines).toBe(
				lines,
			);
		},
	);

	it(
		"reports a rulebook file, since a stage session's corpus freezes rulebook whole",
		verifyReportsARulebookFileSinceAStageSessionS,
	);

	it(
		"reports a rulebook file exactly once, not once per list that carries it",
		verifyReportsARulebookFileExactlyOnceNotOncePer,
	);
});

async function verifyReportsOnlyTheCorpusLayoutNeverAFileBeside(): Promise<void> {
	const root = await fullCorpusDirectory();
	await mkdir(join(root, "daemon"), { recursive: true });
	await writeFile(join(root, "daemon", "control.key"), "secret\n");
	await writeFile(join(root, ".claude.json"), "{}\n");
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.files.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"skills/build/SKILL.md",
		"skills/discuss/SKILL.md",
	]);
}

async function verifyReportsARulebookFileSinceAStageSessionS(): Promise<void> {
	const root = await fullCorpusDirectory();
	await mkdir(join(root, "rulebook"), { recursive: true });
	await writeFile(join(root, "rulebook", "coding-style.md"), "style\n");
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.files.map(({ path }) => path)).toContain(
		"rulebook/coding-style.md",
	);
}

async function verifyReportsARulebookFileExactlyOnceNotOncePer(): Promise<void> {
	const expectedFileCount = 1;

	const root = await fullCorpusDirectory();
	await mkdir(join(root, "rulebook"), { recursive: true });
	await writeFile(join(root, "rulebook", "coding-style.md"), "style\n");
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(
		report.files.filter(({ path }) => path === "rulebook/coding-style.md"),
	).toHaveLength(expectedFileCount);
}
