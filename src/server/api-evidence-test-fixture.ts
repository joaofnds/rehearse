import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { directorySource } from "#benchmark/run-records-test-support";
import StageEvidenceRecordBuilder from "#server/api-evidence-record-builder";
import FinalEvidenceRecordBuilder from "#server/api-final-evidence-record-builder";
import type ApiHttpDriver from "#server/api-test-http-driver";
import type { ApiTestWorkspace } from "#server/api-test-workspace";

const evidenceRun = "2026-09-27T00-00-00.000Z";

async function evidenceApp(
	workspace: Readonly<
		Pick<ApiTestWorkspace, "emptyDirectory" | "corpusDirectory" | "start">
	>,
): Promise<ApiHttpDriver> {
	const runsDirectory = await workspace.emptyDirectory(
		"rehearse-api-evidence-",
	);
	await writeFile(
		join(runsDirectory, `${evidenceRun}.build.json`),
		JSON.stringify(new StageEvidenceRecordBuilder().build()),
	);
	await writeFile(
		join(runsDirectory, `${evidenceRun}.json`),
		JSON.stringify(new FinalEvidenceRecordBuilder().build()),
	);
	const corpusRoot = await workspace.corpusDirectory();

	return await workspace.start({
		runsDirectory,
		source: directorySource(corpusRoot),
	});
}

export { evidenceApp, evidenceRun };
