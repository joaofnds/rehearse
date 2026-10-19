import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	CONTROL_DIR,
	DEFAULT_CASE_ID,
	displayPath,
	parseCaseId,
	parseRunName,
	recordsDirectory,
} from "./config";

function defaultsToTheAuditLogCase(): void {
	expect(parseCaseId(["--model", "sonnet"], {})).toBe(DEFAULT_CASE_ID);
}

function readsTheCaseFromTheEnvironmentWhenTheFlagIsAbsent(): void {
	expect(parseCaseId([], { BENCHMARK_CASE: "other" })).toBe("other");
}

function prefersTheFlagOverTheEnvironment(): void {
	expect(parseCaseId(["--case", "flagged"], { BENCHMARK_CASE: "other" })).toBe(
		"flagged",
	);
}

function readsTheRunNamedByRun(): void {
	expect(parseRunName(["--run", "run-1", "--stage", "build"])).toBe("run-1");
}

function refusesWhenRunIsAbsent(): void {
	expect(() => parseRunName(["--stage", "build"])).toThrow(
		"Provide --run with the run's name",
	);
}

function namesAPathUnderTheControlRootRelativeToIt(): void {
	expect(displayPath(join(CONTROL_DIR, ".benchmark-runs/absent.json"))).toBe(
		".benchmark-runs/absent.json",
	);
}

function disclosesNoHomeDirectoryForAPathUnderTheControlRoot(): void {
	expect(displayPath(join(CONTROL_DIR, "cases/smoke/case.json"))).not.toContain(
		homedir(),
	);
}

function leavesAPathOutsideTheControlRootAsItIs(): void {
	expect(displayPath("/tmp/elsewhere/record.json")).toBe(
		"/tmp/elsewhere/record.json",
	);
}

function keepsRecordsUnderTheRepositorySBenchmarkRunsWhenNothingOverridesIt(): void {
	expect(recordsDirectory({})).toBe(join(CONTROL_DIR, ".benchmark-runs"));
}

function keepsRecordsWhereREHEARSERECORDSDIRNames(): void {
	expect(recordsDirectory({ REHEARSE_RECORDS_DIR: "/elsewhere/records" })).toBe(
		"/elsewhere/records",
	);
}

function resolvesARelativeREHEARSERECORDSDIRAgainstTheWorkingDirectory(): void {
	expect(recordsDirectory({ REHEARSE_RECORDS_DIR: "./records" })).toBe(
		join(process.cwd(), "records"),
	);
}

function refusesAnEmptyREHEARSERECORDSDIRRatherThanWritingIntoTheWorkingDirectory(): void {
	expect(() => recordsDirectory({ REHEARSE_RECORDS_DIR: "" })).toThrow(
		"REHEARSE_RECORDS_DIR is empty",
	);
}

describe(parseCaseId.name, () => {
	it("defaults to the audit-log case", defaultsToTheAuditLogCase);
	it(
		"reads the case from the environment when the flag is absent",
		readsTheCaseFromTheEnvironmentWhenTheFlagIsAbsent,
	);
	it("prefers the flag over the environment", prefersTheFlagOverTheEnvironment);
});

describe(parseRunName.name, () => {
	it("reads the run named by --run", readsTheRunNamedByRun);
	it("refuses when --run is absent", refusesWhenRunIsAbsent);
});

describe(displayPath.name, () => {
	it(
		"names a path under the control root relative to it",
		namesAPathUnderTheControlRootRelativeToIt,
	);
	it(
		"discloses no home directory for a path under the control root",
		disclosesNoHomeDirectoryForAPathUnderTheControlRoot,
	);
	it(
		"leaves a path outside the control root as it is",
		leavesAPathOutsideTheControlRootAsItIs,
	);
});

describe(recordsDirectory.name, () => {
	it(
		"keeps records under the repository's .benchmark-runs when nothing overrides it",
		keepsRecordsUnderTheRepositorySBenchmarkRunsWhenNothingOverridesIt,
	);
	it(
		"keeps records where REHEARSE_RECORDS_DIR names",
		keepsRecordsWhereREHEARSERECORDSDIRNames,
	);
	it(
		"resolves a relative REHEARSE_RECORDS_DIR against the working directory",
		resolvesARelativeREHEARSERECORDSDIRAgainstTheWorkingDirectory,
	);
	it(
		"refuses an empty REHEARSE_RECORDS_DIR rather than writing into the working directory",
		refusesAnEmptyREHEARSERECORDSDIRRatherThanWritingIntoTheWorkingDirectory,
	);
});
