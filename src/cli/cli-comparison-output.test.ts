import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseComparisonReport } from "#benchmark/comparison-record";
import { recordsDirectory } from "#benchmark/config";
import { CliTestWorkspace } from "#cli/cli-test-support";

import { controlCopy } from "./cli-pipeline-test-fixture";
import {
	CLI_TEST_TIMEOUT_MS,
	environmentWithoutRecordsLocation,
	runCli,
	runCliThroughPipe,
} from "./cli-process-test-driver";
import {
	PIPE_BUFFER_BYTES,
	reportForComparisonManifest,
	writeOversizedManifest,
} from "./cli-record-observation";

const workspace = CliTestWorkspace.forEachTest();

const FIRST_FIXTURE_ORDINAL = 1;
const OVERSIZED_MANIFEST_FIXTURE_COUNT = 6;
const OVERSIZED_CASE_COUNT = 12;

const EXPECTED_COMPLETED_EXIT_CODE = 0;

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

async function printsOnlyTheReportPathForAValidManifest(): Promise<void> {
	const fixture = await workspace.comparisonEvidence();
	const { directory: reportDirectory, reportFile } =
		await reportForComparisonManifest(fixture.manifestFile);
	workspace.track(reportDirectory);

	const result = await runCli(["compare", fixture.manifestFile]);

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	expect(result.stdout).toBe(`${reportFile}\n`);
	expect(result.stderr).toBe("");
}

async function printsExactlyTheReportJSONOnStdoutWithJson(): Promise<void> {
	const expectedCaseCount = 2;

	const fixture = await workspace.comparisonEvidence();
	const { directory: reportDirectory, reportFile } =
		await reportForComparisonManifest(fixture.manifestFile);
	workspace.track(reportDirectory);

	const result = await runCli(["compare", fixture.manifestFile, "--json"]);

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	expect(result.stderr).toBe("");
	expect(result.stdout).toBe(await Bun.file(reportFile).text());
	expect(parseComparisonReport(result.stdout).cases).toHaveLength(
		expectedCaseCount,
	);
	expect(JSON.parse(result.stdout)).toEqual(
		JSON.parse(await Bun.file(reportFile).text()),
	);
}

async function deliversARecordLargerThanThePipeBufferWhole(): Promise<void> {
	const roots = await Promise.all(
		Array.from(
			{ length: OVERSIZED_MANIFEST_FIXTURE_COUNT },
			async (_value, index) =>
				await workspace.createDirectory(
					`rehearse-cli-oversized-${String(index + FIRST_FIXTURE_ORDINAL)}-`,
				),
		),
	);
	const manifestFile = await writeOversizedManifest(roots);
	const { directory: reportDirectory, reportFile } =
		await reportForComparisonManifest(manifestFile);
	workspace.track(reportDirectory);

	const piped = await runCliThroughPipe(["compare", manifestFile, "--json"]);

	const written = await Bun.file(reportFile).text();
	expect(written.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
	expect(piped.length).toBe(written.length);
	expect(piped).toBe(written);
	expect(parseComparisonReport(piped).cases).toHaveLength(OVERSIZED_CASE_COUNT);
}

async function writesASpawnedCLISComparisonReportOutsideThe(): Promise<void> {
	const fixture = await workspace.comparisonEvidence();

	const stdout = await runCliThroughPipe(["compare", fixture.manifestFile]);

	expect(stdout).toStartWith(join(recordsDirectory(), "comparisons"));
	expect(recordsDirectory()).toStartWith(tmpdir());
}

async function writesAComparisonReportUnderTheControlSBenchmark(): Promise<void> {
	const directory = await mkdtemp(
		join(tmpdir(), "rehearse-cli-default-records-"),
	);
	workspace.track(directory);
	const control = await controlCopy(directory);
	const fixture = await CliTestWorkspace.comparisonEvidenceAt(directory);

	const child = Bun.spawn(
		[
			process.execPath,
			join(control, "rehearse.ts"),
			"compare",
			fixture.manifestFile,
		],
		{
			cwd: directory,
			env: environmentWithoutRecordsLocation(),
			stderr: "pipe",
			stdout: "pipe",
		},
	);
	const [exitCode, stdout] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
	]);

	expect(exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	expect(stdout).toStartWith(
		join(await realpath(control), ".benchmark-runs", "comparisons"),
	);
}

describe("rehearse", () => {
	it(
		"prints only the report path for a valid manifest, and nothing on stdout otherwise",
		printsOnlyTheReportPathForAValidManifest,
	);
	it(
		"prints exactly the report JSON on stdout with --json",
		printsExactlyTheReportJSONOnStdoutWithJson,
	);
	it(
		"delivers a record larger than the pipe buffer whole on stdout",
		deliversARecordLargerThanThePipeBufferWhole,
	);
	it(
		"writes a spawned CLI's comparison report outside the operator's records directory",
		writesASpawnedCLISComparisonReportOutsideThe,
	);
	it(
		"writes a comparison report under the control's .benchmark-runs, wherever it runs from, when nothing overrides the records location",
		writesAComparisonReportUnderTheControlSBenchmark,
	);
});
