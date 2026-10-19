import { afterEach, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "#benchmark/run-records-test-support";
import { readRunHistoryResponse } from "#server/api-test-driver";
import { runHistoryResponseFrom } from "#server/api-test-responses";
import { ApiTestWorkspace, apiTestApp } from "#server/api-test-workspace";

const lastEditSchema = z.object({ rows: z.array(z.string()) });

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

interface InvalidatedRunFixture {
	readonly app: ReturnType<typeof apiTestApp>;
	readonly fixture: RecordedRunsFixture;
}

async function invalidatedStoppedRun(): Promise<InvalidatedRunFixture> {
	const root = await workspace.emptyDirectory("rehearse-api-");
	const fixture = new RecordedRunsFixture(root, {
		settingsFile: await liveStageSettings(),
	});
	await fixture.stopped.writeStoppedRun();
	const corpus = await workspace.corpusDirectory();
	await fixture.corpus.recordStoppedStageFrom(directorySource(corpus));
	await writeFile(join(corpus, "skills", "build", "SKILL.md"), "edited\n");
	const app = apiTestApp(fixture.runsDirectory, directorySource(corpus));

	return { app, fixture };
}

describe("GET /api/runs", () => {
	it(
		"answers the rows the corpus's last edit invalidated as stale rows, a stopped run among them",
		verifyAnswersTheRowsTheCorpusSLastEditInvalidated,
	);

	it(
		"recomputes staleness fresh on every request rather than caching it",
		verifyRecomputesStalenessFreshOnEveryRequestRatherThanCaching,
	);
});

async function verifyAnswersTheRowsTheCorpusSLastEditInvalidated(): Promise<void> {
	const { app, fixture } = await invalidatedStoppedRun();
	const corpusResponse = await app.read("/api/corpus");
	const { lastEdit } = z
		.object({ lastEdit: lastEditSchema })
		.parse(await corpusResponse.json());
	const invalidated = lastEdit.rows;

	const response = await app.selectedRuns([invalidated]);
	const body = await runHistoryResponseFrom(response);

	expect(invalidated).toEqual([`run:${fixture.stoppedRun}`]);
	expect(
		body.rows.map(({ run, staleness }) => ({ run, staleness })),
	).toMatchObject([
		{
			run: fixture.stoppedRun,
			staleness: {
				distance: { kind: "measured", versions: 1 },
				stale: true,
			},
		},
	]);
}

async function verifyRecomputesStalenessFreshOnEveryRequestRatherThanCaching(): Promise<void> {
	const { fixture, corpus, app } = await workspace.servingLiveSettings();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));

	const { body: first } = await readRunHistoryResponse(app);
	await Bun.write(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);
	const { body: second } = await readRunHistoryResponse(app);

	const firstRow = first.rows.find((row) => row.run === fixture.replayableRun);
	const secondRow = second.rows.find(
		(row) => row.run === fixture.replayableRun,
	);
	expect(firstRow?.staleness).toMatchObject({ stale: false });
	expect(secondRow?.staleness).toMatchObject({ stale: true });
}
