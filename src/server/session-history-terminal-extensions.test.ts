import { afterEach, describe, expect, it } from "bun:test";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { readStageHistory } from "#server/session-history-reader";
import {
	clearSessionHistoryRoots,
	writtenAwaitingJudgeRun,
	writtenStoppedRun,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

const IGNORED_EXTENSION_NESTING_DEPTH = 20_000;

describe("readStageHistory", () => {
	describe.each([
		{ extension: "1e400", name: "an overflowing JSON number" },
		{
			extension: `${"[".repeat(IGNORED_EXTENSION_NESTING_DEPTH)}0${"]".repeat(IGNORED_EXTENSION_NESTING_DEPTH)}`,
			name: "deeply nested JSON",
		},
	])(
		"when an ignored terminal record extension contains $name",
		({ extension }) => {
			it.each([
				{ kind: "stopped-stage", prepare: writtenStoppedRun },
				{ kind: "awaiting-judge-stage", prepare: writtenAwaitingJudgeRun },
			])("reads the $kind history", async ({ kind, prepare }) => {
				const fixture = await prepare();
				const path = benchmarkRunPaths(
					fixture.runsDirectory,
					fixture.run,
				).stageFile(fixture.stage);
				const text = await Bun.file(path).text();
				await Bun.write(
					path,
					text.replace(/\}\s*$/u, `,"extension":${extension}}`),
				);

				const report = await readStageHistory(fixture);

				expect(report.attempt).toMatchObject({ kind, stage: fixture.stage });
			});
		},
	);
});
