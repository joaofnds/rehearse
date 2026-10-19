import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CASES_DIRECTORY } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { directorySource } from "#benchmark/run-records-test-support";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { apiTestApp } from "#server/api-test-workspace";
import type { ApiTestWorkspace } from "#server/api-test-workspace";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

async function missingSettingsCase(
	workspace: Readonly<ApiTestWorkspace>,
): Promise<string> {
	const caseId = "zz-api-settings-missing";
	const caseDirectory = join(CONTROL_DIR, CASES_DIRECTORY, caseId);
	workspace.track(caseDirectory);
	await mkdir(caseDirectory, { recursive: true });
	await Bun.write(
		join(caseDirectory, "case.json"),
		JSON.stringify({
			finalRubric: "rubric.md",
			id: caseId,
			kind: "pipeline",
			pipeline: "pipeline.json",
			productBrief: "brief.md",
			rubrics: "rubrics",
			settingsFile: "settings.json",
			target: { path: "/target" },
			task: "task.md",
			title: "Missing settings",
		}),
	);

	return caseId;
}

interface MissingSettingsFixture {
	readonly app: ReturnType<typeof apiTestApp>;
	readonly fixture: RecordedRunsFixture;
	readonly brokenRun: string;
	readonly caseId: string;
}

async function missingSettingsFixture(
	workspace: Readonly<ApiTestWorkspace>,
): Promise<MissingSettingsFixture> {
	const fixture = await workspace.fixtureRecordingLiveSettings();
	const corpus = await workspace.corpusDirectory();
	const brokenRun = "2026-09-07T00-00-00.000Z";
	const caseId = await missingSettingsCase(workspace);
	await fixture.pipeline.writePipelineRun({
		caseId,
		run: brokenRun,
		settingsFile: {
			path: `cases/${caseId}/settings.json`,
			sha256: "0".repeat(SHA256_HEX_DIGITS),
		},
	});
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await fixture.corpus.recordCorpusFrom(directorySource(corpus), brokenRun);
	const app = apiTestApp(fixture.runsDirectory, directorySource(corpus));

	return { app, brokenRun, caseId, fixture };
}

export { missingSettingsFixture as default };
