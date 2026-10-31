import { afterEach } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
	AnalysisDependencies,
	AnalysisInvoker,
} from "./root-cause-analysis";
import { RUN, noSignalHandling } from "./root-cause-analysis-test-support";
import { rootCauseAnalysesDirectory } from "./run-layout";
import type { RunLiveness } from "./run-liveness";
import { claimBy, nothingRunning } from "./run-records-test-support";

const CLOCK_TICK_SECONDS = 4;

const OPTION_AND_VALUE_COUNT = 2;

const CLOCK_YEAR = 2026;

const CLOCK_MONTH_INDEX = 9;

const CLOCK_DAY_OF_MONTH = 4;

const CLOCK_HOUR = 12;

const CLOCK_MINUTE = 0;

const STORED_SPEND_CEILING_USD = 30;

const REDUCED_STORED_SPEND_CEILING_USD = 2;

const ANALYSIS_BUDGET_USD = 1;

const FIRST_UNREADABLE_ANALYSIS_INDEX = 0;

const SECOND_RECORDED_STAGE_INDEX = 1;

const FIRST_RECORDED_STAGE_INDEX = 0;

const RESOURCE_DRAIN_START_INDEX = 0;

const CLOCK_TICK_INCREMENT = 1;

const roots: string[] = [];

async function runsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-root-cause-"));
	roots.push(root);

	return root;
}

const RUNNING_PID = 4242;

const stillRunning: RunLiveness = {
	isAlive: (pid) => pid === RUNNING_PID,
	readMarker: async () => await Promise.resolve(claimBy(RUN, RUNNING_PID)),
};

async function snapshot(root: string): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	await Array.fromAsync(
		await readdir(root, {
			recursive: true,
			withFileTypes: true,
		}),
		async (entry) => {
			if (entry.isFile()) {
				const path = join(entry.parentPath, entry.name);
				files.set(path.slice(root.length), await Bun.file(path).text());
			}
		},
	);

	return files;
}

function steppingClock(): () => Date {
	let tick = 0;

	return () => {
		const moment = new Date(
			Date.UTC(
				CLOCK_YEAR,
				CLOCK_MONTH_INDEX,
				CLOCK_DAY_OF_MONTH,
				CLOCK_HOUR,
				CLOCK_MINUTE,
				tick * CLOCK_TICK_SECONDS,
			),
		);
		tick += CLOCK_TICK_INCREMENT;

		return moment;
	};
}

function dependencies(invoke: AnalysisInvoker): AnalysisDependencies {
	return {
		invoke,
		liveness: nothingRunning,
		now: steppingClock(),
		requireSpendCeiling: async () =>
			await Promise.resolve(STORED_SPEND_CEILING_USD),
		stopOnSignal: noSignalHandling,
	};
}

interface AnalysisStorageExample {
	readonly digest: string;
	readonly json: string;
	readonly name: string;
}

interface AnalysisDiagnosticExample {
	readonly json: string;
	readonly name: string;
	readonly reason: string;
}

async function writeAnalysisFile(
	directory: string,
	text: string,
): Promise<void> {
	const runAnalyses = join(rootCauseAnalysesDirectory(directory), RUN);
	await mkdir(runAnalyses, { recursive: true });
	await Bun.write(join(runAnalyses, "2026-10-04T13-12-13.567Z.json"), text);
}
function registerAnalysisFixtureCleanup(): void {
	afterEach(async () => {
		await Promise.all(
			roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
				await rm(root, { force: true, recursive: true });
			}),
		);
	});
}
function laterRunHolds(): RunLiveness {
	return {
		isAlive: (pid) => pid === RUNNING_PID,
		readMarker: async () =>
			await Promise.resolve(claimBy("2026-10-04T11-00-00.000Z", RUNNING_PID)),
	};
}
function unnamedClaim(): RunLiveness {
	return {
		isAlive: (pid) => pid === RUNNING_PID,
		readMarker: async () =>
			await Promise.resolve({
				pid: RUNNING_PID,
				startedAt: "2026-10-04T10:00:00.000Z",
			}),
	};
}

export {
	laterRunHolds,
	unnamedClaim,
	OPTION_AND_VALUE_COUNT,
	REDUCED_STORED_SPEND_CEILING_USD,
	ANALYSIS_BUDGET_USD,
	FIRST_UNREADABLE_ANALYSIS_INDEX,
	SECOND_RECORDED_STAGE_INDEX,
	FIRST_RECORDED_STAGE_INDEX,
	runsDirectory,
	RUNNING_PID,
	stillRunning,
	snapshot,
	dependencies,
	writeAnalysisFile,
	registerAnalysisFixtureCleanup,
};
export type { AnalysisStorageExample, AnalysisDiagnosticExample };
