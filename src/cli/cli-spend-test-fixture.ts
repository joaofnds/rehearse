import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import {
	benchmarkRunPaths,
	benchmarkRunsDirectory,
} from "#benchmark/run-layout";

import { environmentWithoutKnobs } from "./cli-process-test-driver";
import { PROVIDER_CALLS_LOG } from "./cli-provider-test-fixture";
import { recordedCheckout } from "./cli-record-observation";

interface SettingsRecords {
	readonly records: string;
	readonly environment: () => Readonly<Record<string, string>>;
}
function settingsRecords(): SettingsRecords {
	const records = join(tmpdir(), `rehearse-cli-settings-${randomUUID()}`);
	return {
		environment: () => ({
			...environmentWithoutKnobs(),
			[RECORDS_DIRECTORY_VARIABLE]: records,
		}),
		records,
	};
}
interface BudgetHaltEvidence {
	readonly stageRecord: unknown;
	readonly manifest: unknown;
	readonly paidCalls: readonly string[];
	readonly checkout: string;
}
interface BudgetHaltLocation {
	readonly control: string;
	readonly binDirectory: string;
}
async function paidProviderCalls(
	binDirectory: string,
): Promise<readonly string[]> {
	const text = await Bun.file(join(binDirectory, PROVIDER_CALLS_LOG)).text();
	return text
		.trimEnd()
		.split("\n")
		.filter((call) => call.includes("--max-budget-usd"));
}
async function budgetHaltEvidence({
	control,
	binDirectory,
}: BudgetHaltLocation): Promise<BudgetHaltEvidence> {
	const runsDirectory = benchmarkRunsDirectory(control);
	const runFiles = await readdir(runsDirectory);
	const stopRecord =
		runFiles.find((entry) => entry.endsWith(".shape.json")) ?? "";
	const stageRecord: unknown = await Bun.file(
		join(runsDirectory, stopRecord),
	).json();
	const { manifestFile } = benchmarkRunPaths(
		runsDirectory,
		basename(stopRecord, ".shape.json"),
	);
	const manifest: unknown = await Bun.file(manifestFile).json();
	const { checkout } = await recordedCheckout(control);
	return {
		checkout,
		manifest,
		paidCalls: await paidProviderCalls(binDirectory),
		stageRecord,
	};
}

export { budgetHaltEvidence, settingsRecords };
