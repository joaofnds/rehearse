import { describe, expect, it } from "bun:test";

import { parseComparisonReport } from "#benchmark/comparison-record";
import { comparisonReportPaths } from "#benchmark/run-layout";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import type { ListRequest } from "#cli/list-command";
import { runList } from "#cli/list-command";
import type { ShowRequest } from "#cli/show-command";
import { runShow } from "#cli/show-command";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

import {
	MULTIPLE_GROUP_COMPARISON_REPORT_VERSION,
	legacyComparisonReport,
	legacyComparisonVersions,
} from "./list-comparison-test-fixture";
import type { LegacyComparisonVersion } from "./list-comparison-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

function lines(stdout: readonly string[]): readonly string[] {
	const text = stdout.join("");

	return text === "" ? [] : text.trimEnd().split("\n");
}

async function printsOneLinePerComparisonReportWithItsCase(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();

	await runList(
		{ kind: "comparisons", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toEqual([
		`comparison:${fixture.comparisonDigest}\t2 cases\t4 reps`,
	]);
}

async function listsAnExtensionInPlaceOfTheComparisonIt(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const extension = await fixture.comparisons.recordExtension();
	const recorder = recordOutput();

	await runList(
		{ kind: "comparisons", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toEqual([
		`comparison:${extension}\t2 cases\t4 reps`,
	]);
}

describe(runList.name, () => {
	it(
		"prints one line per comparison report with its case and rep counts",
		printsOneLinePerComparisonReportWithItsCase,
	);
	it(
		"lists an extension in place of the comparison it extends",
		listsAnExtensionInPlaceOfTheComparisonIt,
	);
});

interface LegacyComparisonWriting {
	readonly fixture: {
		readonly runsDirectory: string;
		readonly comparisonDigest: string;
	};
	readonly version: LegacyComparisonVersion;
}

interface LegacyComparisonReadings {
	readonly text: string;
	readonly listed: ReturnType<typeof recordOutput>;
	readonly shownJson: ReturnType<typeof recordOutput>;
	readonly summary: ReturnType<typeof recordOutput>;
	readonly listRequest: ListRequest;
	readonly showRequest: Pick<ShowRequest, "id" | "runsDirectory">;
}

async function writeLegacyComparison({
	fixture,
	version,
}: LegacyComparisonWriting): Promise<LegacyComparisonReadings> {
	const paths = comparisonReportPaths(
		fixture.runsDirectory,
		fixture.comparisonDigest,
	);
	const current = parseComparisonReport(
		await Bun.file(paths.reportFile).text(),
	);
	if (
		current.schemaVersion !== MULTIPLE_GROUP_COMPARISON_REPORT_VERSION ||
		"samplingUnit" in current
	) {
		throw new Error(
			"expected the fixture to write a multi-case version-6 report",
		);
	}

	const text = `${JSON.stringify(legacyComparisonReport(current, version), null, RECORD_JSON_INDENT_SPACES)}\n`;
	await Bun.write(paths.reportFile, text);

	return {
		listRequest: { kind: "comparisons", runsDirectory: fixture.runsDirectory },
		listed: recordOutput(),
		showRequest: {
			id: `comparison:${fixture.comparisonDigest}`,
			runsDirectory: fixture.runsDirectory,
		},
		shownJson: recordOutput(),
		summary: recordOutput(),
		text,
	};
}

async function readsLegacyComparisonWithoutChangingItsBytes(
	version: LegacyComparisonVersion,
): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const { text, listed, shownJson, summary, listRequest, showRequest } =
		await writeLegacyComparison({ fixture, version });
	await runList(listRequest, listed.output);
	expect(lines(listed.stdout)).toEqual([
		`comparison:${fixture.comparisonDigest}\t2 cases\t4 reps`,
	]);
	expect(listed.stderr).toEqual([]);
	await runShow({ ...showRequest, json: true }, shownJson.output);
	expect(shownJson.stdout.join("")).toBe(text);
	expect(parseComparisonReport(text).schemaVersion).toBe(version);
	await runShow({ ...showRequest, json: false }, summary.output);
	expect(summary.stdout.join("")).toContain("2 cases");
}

describe("legacy comparison records", () => {
	describe("when listing a historical report before reading its JSON and summary", () => {
		it.each([...legacyComparisonVersions])(
			"reads a version-%i comparison without rewriting its evidence",
			readsLegacyComparisonWithoutChangingItsBytes,
		);
	});
});
