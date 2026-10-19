import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { CONTROL_DIR, RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { CEILING_OVERRUN_STATEMENT } from "#benchmark/spend-ceiling";
import { LaunchFixture } from "#server/launch-http-test-fixture";
import { reading, readingSchema } from "#server/launch-settings-test-reading";

import { directoryLiveCorpus } from "./launch-test-support";

const launchFixture = new LaunchFixture();

const { harness, corpusDirectory } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

describe("GET /api/settings", () => {
	it(
		"reads the ceiling, the records location, the linked corpus and the overrun",
		verifyReadsTheCeilingTheRecordsLocationTheLinkedCorpus,
	);
});

describe("PUT /api/settings/spend-ceiling", () => {
	it(
		"stores a ceiling the server reads back after a restart",
		verifyStoresACeilingTheServerReadsBackAfterA,
	);
	it(
		"stores a ceiling a new CLI process reads back",
		verifyStoresACeilingANewCLIProcessReadsBack,
	);
});

describe("PUT /api/settings/corpus", () => {
	it(
		"links a corpus directory and reads it back",
		verifyLinksACorpusDirectoryAndReadsItBack,
	);
	it(
		"links a directory written from the operator's home with ~/",
		verifyLinksADirectoryWrittenFromTheOperatorSHome,
	);
});

describe("DELETE /api/settings/corpus", () => {
	it(
		"unlinks the corpus, leaving the live install linked",
		verifyUnlinksTheCorpusLeavingTheLiveInstallLinked,
	);
});

async function verifyReadsTheCeilingTheRecordsLocationTheLinkedCorpus(): Promise<void> {
	const { get, runsDirectory } = await harness();

	const response = await get("/api/settings");

	expect(readingSchema.parse(await response.json())).toEqual({
		linkedCorpus: {
			kind: "live",
			root: directoryLiveCorpus(runsDirectory).root,
		},
		overrun: CEILING_OVERRUN_STATEMENT,
		recordsDirectory: runsDirectory,
		spendCeilingUsd: 5,
	});
}

async function verifyStoresACeilingTheServerReadsBackAfterA(): Promise<void> {
	const expectedSpendCeilingUsd = 2.5;

	const served = await harness("missing");
	await served.send("PUT", "/api/settings/spend-ceiling", { usd: 2.5 });

	const restarted = await served.restarted();
	const response = await restarted.get("/api/settings");

	expect(readingSchema.parse(await response.json()).spendCeilingUsd).toBe(
		expectedSpendCeilingUsd,
	);
}

async function verifyStoresACeilingANewCLIProcessReadsBack(): Promise<void> {
	const expectedExited = 0;

	const { send, runsDirectory } = await harness("missing");
	await send("PUT", "/api/settings/spend-ceiling", { usd: 2.5 });

	const child = Bun.spawn(
		[process.execPath, join(CONTROL_DIR, "rehearse.ts"), "settings", "--json"],
		{
			env: { ...Bun.env, [RECORDS_DIRECTORY_VARIABLE]: runsDirectory },
			stdout: "pipe",
		},
	);
	const stdout = await new Response(child.stdout).text();

	expect(await child.exited).toBe(expectedExited);
	expect(JSON.parse(stdout)).toMatchObject({ spendCeilingUsd: 2.5 });
}

async function verifyLinksACorpusDirectoryAndReadsItBack(): Promise<void> {
	const { send, get } = await harness();
	const corpus = await corpusDirectory();

	const linked = await send("PUT", "/api/settings/corpus", {
		directory: corpus,
	});

	expect(linked.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const after = await reading(get);
	expect(after.linkedCorpus).toEqual({
		kind: "directory",
		root: corpus,
	});
}

async function verifyLinksADirectoryWrittenFromTheOperatorSHome(): Promise<void> {
	const { send, get, home } = await harness();
	const corpus = join(home, "code", "omelette", ".claude");
	await Bun.write(join(corpus, "CLAUDE.md"), "linked\n");

	const linked = await send("PUT", "/api/settings/corpus", {
		directory: "~/code/omelette/.claude",
	});

	expect(linked.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const after = await reading(get);
	expect(after.linkedCorpus).toEqual({ kind: "directory", root: corpus });
}

async function verifyUnlinksTheCorpusLeavingTheLiveInstallLinked(): Promise<void> {
	const { send, get } = await harness();
	await send("PUT", "/api/settings/corpus", {
		directory: await corpusDirectory(),
	});

	const unlinked = await send("DELETE", "/api/settings/corpus", {});

	expect(unlinked.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const after = await reading(get);
	expect(after.linkedCorpus.kind).toBe("live");
}
