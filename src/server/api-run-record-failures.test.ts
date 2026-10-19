import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { CONTROL_DIR } from "#benchmark/config";
import { benchmarkRunPaths, checkpointRecordFile } from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import { readRunHistoryResponse } from "#server/api-test-driver";
import missingSettingsFixture from "#server/api-test-missing-settings";
import { ApiTestWorkspace } from "#server/api-test-workspace";

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

describe("GET /api/runs", () => {
	it(
		"answers the healthy rows when one run's manifest does not parse",
		verifyAnswersTheHealthyRowsWhenOneRunSManifest,
	);

	it(
		"gives a run whose checkpoint does not parse the parse error as its unavailable reason",
		verifyGivesARunWhoseCheckpointDoesNotParseThe,
	);

	it(
		"keeps healthy rows when one run's current settings are unavailable",
		verifyKeepsHealthyRowsWhenOneRunSCurrentSettings,
	);
});

async function verifyAnswersTheHealthyRowsWhenOneRunSManifest(): Promise<void> {
	const { fixture, app } = await workspace.serving();
	const brokenRun = "2026-09-12T00-00-00.000Z";
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: brokenRun,
	});
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, brokenRun).manifestFile,
		"{ not json",
	);

	const { response, body } = await readRunHistoryResponse(app);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.rows.some((row) => row.run === fixture.replayableRun)).toBe(true);
}

async function verifyGivesARunWhoseCheckpointDoesNotParseThe(): Promise<void> {
	const { fixture, corpus, app } = await workspace.serving();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await Bun.write(
		checkpointRecordFile(
			benchmarkRunPaths(
				fixture.runsDirectory,
				fixture.replayableRun,
			).checkpointDirectory("build"),
		),
		"{ not json",
	);

	const { body } = await readRunHistoryResponse(app);

	const staleness = body.rows.find(
		({ run }) => run === fixture.replayableRun,
	)?.staleness;
	expect(staleness?.state).toBe("unavailable");
	expect(
		staleness?.state === "unavailable" && staleness.reasons.join("\n"),
	).toContain("JSON Parse error");
}

async function verifyKeepsHealthyRowsWhenOneRunSCurrentSettings(): Promise<void> {
	const { app, fixture, brokenRun, caseId } =
		await missingSettingsFixture(workspace);

	const { response, body } = await readRunHistoryResponse(app);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(
		body.rows.find(({ run }) => run === fixture.replayableRun)?.staleness,
	).toMatchObject({ stale: false, state: "available" });
	const broken = body.rows.find(({ run }) => run === brokenRun);
	expect(broken?.staleness).toMatchObject({
		stale: true,
		state: "available",
	});
	expect(JSON.stringify(broken?.staleness)).toContain(
		`cases/${caseId}/settings.json`,
	);
	expect(JSON.stringify(body)).not.toContain(CONTROL_DIR);
}
