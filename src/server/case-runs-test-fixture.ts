import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RecordedRunsFixture } from "#benchmark/run-records-test-support";

const root = join(tmpdir(), `rehearse-case-runs-${randomUUID()}`);

const fixture = new RecordedRunsFixture(root);

async function prepareCaseRunRoot(): Promise<void> {
	await mkdir(root, { recursive: true });
}

async function clearCaseRunRoot(): Promise<void> {
	await rm(root, { force: true, recursive: true });
}

export { root, fixture, prepareCaseRunRoot, clearCaseRunRoot };
