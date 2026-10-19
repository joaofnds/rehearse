import { afterEach, describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { SET_SPEND_CEILING_COMMAND } from "#benchmark/settings";
import { LaunchFixture, refusalSchema } from "#server/launch-http-test-fixture";
import { reading } from "#server/launch-settings-test-reading";

const launchFixture = new LaunchFixture();

const { temporaryDirectory, harness, corpusDirectory } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const CONFLICTING_SETTINGS_REQUESTS = [
	["PUT", "/api/settings/spend-ceiling", { usd: 2 }],
	["PUT", "/api/settings/corpus", { directory: "<corpus>" }],
	["DELETE", "/api/settings/corpus", {}],
	["POST", "/api/settings/corpus/rehash", {}],
] as const;

const INVALID_CEILINGS = ([{ usd: 0 }, { usd: -1 }, { usd: "5" }] as const).map(
	({ usd }) => [usd] as const,
);

const RELATIVE_CORPUS_DIRECTORIES = [
	"",
	"corpus",
	"./corpus",
	"~operator/corpus",
];

describe.each(CONFLICTING_SETTINGS_REQUESTS)("%s %s", (method, path, body) => {
	describe("when the settings file cannot be read", () => {
		it("answers with a conflict and leaves the file", async () => {
			const { send, runsDirectory } = await harness("missing");
			const settingsFile = join(runsDirectory, "settings.json");
			await Bun.write(settingsFile, "not json");

			const corpus = await corpusDirectory();

			const response = await send(
				method,
				path,
				"directory" in body ? { directory: corpus } : body,
			);

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
			expect(refusalSchema.parse(await response.json()).error).toContain(
				SET_SPEND_CEILING_COMMAND,
			);
			expect(await Bun.file(settingsFile).text()).toBe("not json");
		});
	});
});

describe("PUT /api/settings/spend-ceiling", () => {
	it.each(INVALID_CEILINGS)("refuses %p as a ceiling", async (usd) => {
		const { send, get } = await harness();

		const response = await send("PUT", "/api/settings/spend-ceiling", {
			usd,
		});

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
		const after = await reading(get);
		expect(after).toMatchObject({ spendCeilingUsd: 5 });
	});
});

describe("PUT /api/settings/corpus", () => {
	it(
		"refuses a directory holding no corpus and keeps the link",
		verifyRefusesADirectoryHoldingNoCorpusAndKeepsThe,
	);
	it(
		"refuses a directory whose files resolve outside it, naming why, and keeps the link",
		verifyRefusesADirectoryWhoseFilesResolveOutsideItNaming,
	);
	it.each(RELATIVE_CORPUS_DIRECTORIES)(
		"refuses %p as a bad request naming the absolute-path rule, since the server's working directory is not the browser's",
		verifyRelativeCorpusDirectories,
	);
});

async function verifyRefusesADirectoryHoldingNoCorpusAndKeepsThe(): Promise<void> {
	const { send, get } = await harness();
	const linked = await corpusDirectory();
	await send("PUT", "/api/settings/corpus", { directory: linked });
	const notCorpus = await temporaryDirectory("rehearse-not-corpus-");

	const response = await send("PUT", "/api/settings/corpus", {
		directory: notCorpus,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	const after = await reading(get);
	expect(after.linkedCorpus.root).toBe(linked);
}

async function verifyRefusesADirectoryWhoseFilesResolveOutsideItNaming(): Promise<void> {
	const {
		driver: { send, get },
		directory: linked,
	} = await launchFixture.linkedCorpus();
	const outside = await launchFixture.outsideDirectoryWithFile("AGENTS.md");
	const unmeasurable = await temporaryDirectory("rehearse-symlinked-");
	await symlink(join(outside, "AGENTS.md"), join(unmeasurable, "CLAUDE.md"));

	const response = await send("PUT", "/api/settings/corpus", {
		directory: unmeasurable,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain(
		"Corpus file CLAUDE.md resolves outside the corpus source",
	);
	const after = await reading(get);
	expect(after.linkedCorpus.root).toBe(linked);
}

async function verifyRelativeCorpusDirectories(
	directory: Readonly<(typeof RELATIVE_CORPUS_DIRECTORIES)[number]>,
): Promise<void> {
	const { send, get } = await harness();

	const response = await send("PUT", "/api/settings/corpus", {
		directory,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"Link a corpus directory by its absolute path, or one starting with ~/ for your home directory, because the server does not share the browser's working directory",
	);
	const after = await reading(get);
	expect(after.linkedCorpus.kind).toBe("live");
}
