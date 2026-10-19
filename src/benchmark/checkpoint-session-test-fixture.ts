import { join } from "node:path";

import {
	temporaryDirectory,
	writeFixtureFiles,
} from "./checkpoint-filesystem-test-fixture";
import type { CheckpointFixture } from "./checkpoint-workflow-test-fixture";
import { checkpointFixture } from "./checkpoint-workflow-test-fixture";
import { projectSlug } from "./session-capture";
import type { TestResources } from "./test-support";

interface SessionFixture extends CheckpointFixture {
	readonly projectsDirectory: string;
	readonly sessionId: string;
	readonly slug: string;
}

async function sessionFixture(
	resources: Readonly<TestResources>,
): Promise<SessionFixture> {
	const checkpoint = await checkpointFixture(resources);
	const projectsDirectory = await temporaryDirectory(
		resources,
		"rehearse-projects-",
	);
	const sessionId = "0f9a2c1e-1111-4222-8333-444455556666";
	const slug = join(projectsDirectory, projectSlug(checkpoint.targetDir));

	return { ...checkpoint, projectsDirectory, sessionId, slug };
}

interface SessionFiles {
	readonly slug: string;
	readonly sessionId: string;
	readonly raw: string;
	readonly child?: string;
	readonly meta?: string;
}

async function writeSessionFiles({
	slug,
	sessionId,
	raw,
	child,
	meta,
}: SessionFiles): Promise<void> {
	const files: (readonly [string, string])[] = [[`${sessionId}.jsonl`, raw]];
	if (child !== undefined) {
		files.push([`${sessionId}/subagents/agent-a1.jsonl`, child]);
	}

	if (meta !== undefined) {
		files.push([`${sessionId}/subagents/agent-a1.meta.json`, meta]);
	}

	await writeFixtureFiles({ files, root: slug });
}

export { sessionFixture, writeSessionFiles };
