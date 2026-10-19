import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import { corpusVersionLog } from "#benchmark/corpus-version";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { directorySource } from "#benchmark/run-records-test-support";
import { LaunchFixture } from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { harness, corpusDirectory } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const measuredSchema = z.object({
	digest: z.string(),
	label: z.string(),
});

describe("POST /api/settings/corpus/rehash", () => {
	it(
		"records a version of the linked directory and answers its label",
		verifyRecordsAVersionOfTheLinkedDirectoryAndAnswers,
	);
	it(
		"refuses a corpus it can no longer measure, naming why",
		verifyRefusesACorpusItCanNoLongerMeasureNaming,
	);
});

async function verifyRecordsAVersionOfTheLinkedDirectoryAndAnswers(): Promise<void> {
	const { send, runsDirectory } = await harness();
	const corpus = await corpusDirectory();
	await send("PUT", "/api/settings/corpus", { directory: corpus });

	const response = await send("POST", "/api/settings/corpus/rehash", {});
	const measured = measuredSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(measured.label).toBe(corpusVersionLabel(measured.digest));
	expect(
		await corpusVersionLog(runsDirectory, directorySource(corpus)),
	).toEqual([measured.digest]);
}

async function verifyRefusesACorpusItCanNoLongerMeasureNaming(): Promise<void> {
	const { send } = await harness();
	const corpus = await corpusDirectory();
	await send("PUT", "/api/settings/corpus", { directory: corpus });
	const outside = await launchFixture.outsideDirectoryWithFile("secret.md");
	await mkdir(join(corpus, "skills", "leak"), { recursive: true });
	await symlink(
		join(outside, "secret.md"),
		join(corpus, "skills", "leak", "SKILL.md"),
	);

	const response = await send("POST", "/api/settings/corpus/rehash", {});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(
		z.object({ error: z.string() }).parse(await response.json()).error,
	).toContain("SKILL.md");
}
