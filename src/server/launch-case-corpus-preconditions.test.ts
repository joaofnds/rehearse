import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { linkCorpus } from "#benchmark/corpus-source";
import { UNLINK_CORPUS_COMMAND } from "#benchmark/settings";
import type Harness from "#server/launch-http-test-driver";
import { LaunchFixture, refusalSchema } from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { temporaryDirectory, harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

async function linked(): Promise<Harness> {
	const served = await harness();
	const corpus = await temporaryDirectory("rehearse-launch-corpus-");
	await Bun.write(join(corpus, "CLAUDE.md"), "linked\n");
	await linkCorpus(served.runsDirectory, corpus);

	return served;
}

describe("POST /api/launches", () => {
	describe("when a corpus directory is linked", () => {
		it(
			"refuses a pipeline case, naming how to unlink",
			verifyRefusesAPipelineCaseNamingHowToUnlink,
		);
		it(
			"launches a session case, which measures the linked corpus",
			verifyLaunchesASessionCaseWhichMeasuresTheLinkedCorpus,
		);
	});
});

async function verifyRefusesAPipelineCaseNamingHowToUnlink(): Promise<void> {
	const { launcher, post } = await linked();

	const response = await post({
		attempts: 1,
		caseId: "pipe-case",
		kind: "case",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain(
		UNLINK_CORPUS_COMMAND,
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyLaunchesASessionCaseWhichMeasuresTheLinkedCorpus(): Promise<void> {
	const expectedLaunchCount = 1;

	const { launcher, post } = await linked();

	const response = await post({
		attempts: 1,
		caseId: "sess-case",
		kind: "case",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches).toHaveLength(expectedLaunchCount);
}
