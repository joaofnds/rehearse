import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "#benchmark/run-records-test-support";
import { INACCESSIBLE_PERMISSIONS } from "#server/file-permissions-test-support";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function corpusDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-corpus-report-"));
	roots.push(root);

	return root;
}

async function fullCorpusDirectory(): Promise<string> {
	const root = await corpusDirectory();
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await mkdir(join(root, "skills", "discuss"), { recursive: true });
	await writeFile(join(root, "CLAUDE.md"), "instructions\n");
	await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill\n");
	await writeFile(
		join(root, "skills", "discuss", "SKILL.md"),
		"discuss skill\n",
	);

	return root;
}

async function runsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-corpus-report-runs-"));
	roots.push(root);

	return root;
}

async function clearCorpusReportRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function recordedCorpusHistory(
	corpus: string,
	runs: string,
): Promise<RecordedRunsFixture> {
	const fixture = new RecordedRunsFixture(runs, {
		settingsFile: await liveStageSettings(),
	});
	await fixture.write();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await fixture.corpus.recordVersionFrom(directorySource(corpus));

	return fixture;
}

async function unreadableAgentCorpus(
	name: string,
	normal = false,
): Promise<string> {
	const root = await fullCorpusDirectory();
	await mkdir(join(root, "agents"), { recursive: true });
	if (normal) {
		await writeFile(join(root, "agents", "normal.md"), "an agent\n");
	}
	await writeFile(join(root, "agents", name), "an agent\n");
	await chmod(join(root, "agents", name), INACCESSIBLE_PERMISSIONS);

	return root;
}

export {
	corpusDirectory,
	fullCorpusDirectory,
	runsDirectory,
	clearCorpusReportRoots,
	recordedCorpusHistory,
	unreadableAgentCorpus,
};
