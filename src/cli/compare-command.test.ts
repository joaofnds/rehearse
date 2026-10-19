import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseComparisonReport } from "#benchmark/comparison-record";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import runCompare from "#cli/compare-command";

import { comparisonCliFixture } from "./cli-record-observation";

const FIRST_REP_ORDINAL = 1;

const { temporaryDirectory, runsDirectory, fixture } = comparisonCliFixture();

async function printsOnlyTheReportPathWhenJsonIsAbsent(): Promise<void> {
	const expectedCaseCount = 2;

	const recorder = recordOutput();

	await runCompare(
		{ json: false, manifestPath: fixture.manifestFile, runsDirectory },
		recorder.output,
	);

	const reportFile = recorder.stdout.join("").trim();
	expect(recorder.stdout.join("")).toBe(`${reportFile}\n`);
	expect(dirname(dirname(reportFile))).toBe(join(runsDirectory, "comparisons"));
	expect(
		parseComparisonReport(await Bun.file(reportFile).text()).cases,
	).toHaveLength(expectedCaseCount);
}

async function printsTheReportFileSExactBytesOnStdout(): Promise<void> {
	const recorder = recordOutput();

	await runCompare(
		{ json: true, manifestPath: fixture.manifestFile, runsDirectory },
		recorder.output,
	);

	const printed = recorder.stdout.join("");
	const report = parseComparisonReport(printed);
	const reportFile = join(
		runsDirectory,
		"comparisons",
		report.manifest.sha256,
		"report.json",
	);
	expect(printed).toBe(await Bun.file(reportFile).text());
	expect(recorder.stderr).toEqual([]);
}

function refusesAMissingManifestArgumentAsAUsageError(): void {
	const recorder = recordOutput();

	expect(
		runCompare(
			{ json: false, manifestPath: undefined, runsDirectory },
			recorder.output,
		),
	).rejects.toThrow(UsageError);
}

async function classifiesMalformedComparisonEvidenceAsARefusedPrecondition(): Promise<void> {
	const recorder = recordOutput();

	await rm(fixture.repFile("case-1", "baseline", FIRST_REP_ORDINAL));

	expect(
		runCompare(
			{ json: false, manifestPath: fixture.manifestFile, runsDirectory },
			recorder.output,
		),
	).rejects.toBeInstanceOf(RefusedPreconditionError);
}

describe(runCompare.name, () => {
	beforeEach(async () => {
		await mkdir(temporaryDirectory, { recursive: true });
		await mkdir(runsDirectory);
		await fixture.write();
	});
	afterEach(async () => {
		await rm(temporaryDirectory, { force: true, recursive: true });
	});
	it(
		"prints only the report path when --json is absent",
		printsOnlyTheReportPathWhenJsonIsAbsent,
	);
	it(
		"prints the report file's exact bytes on stdout with --json",
		printsTheReportFileSExactBytesOnStdout,
	);
	it(
		"refuses a missing manifest argument as a usage error",
		refusesAMissingManifestArgumentAsAUsageError,
	);
	it(
		"classifies malformed comparison evidence as a refused precondition",
		classifiesMalformedComparisonEvidenceAsARefusedPrecondition,
	);
});
