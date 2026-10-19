import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import {
	LaunchFixture,
	liveRoot,
	refusalSchema,
} from "#server/launch-http-test-fixture";
import { reading } from "#server/launch-settings-test-reading";

import { directoryLiveCorpus } from "./launch-test-support";

const launchFixture = new LaunchFixture();

const { temporaryDirectory, harness, corpusDirectory } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const LIVE_CORPUS_PATHS = [
	{ directory: "", path: "an empty path" } as const,
	{ directory: "  ", path: "a blank path" } as const,
];

describe("PUT /api/setup/corpus", () => {
	it("links a directory in corpus layout", verifyLinksADirectoryInCorpusLayout);
	it.each(LIVE_CORPUS_PATHS)(
		"leaves the live install linked for $path, clearing a directory linked earlier",
		verifyLiveCorpusPaths,
	);
	it(
		"leaves the live install linked for a path from home that resolves to it, rather than linking it as a directory",
		verifyLeavesTheLiveInstallLinkedForAPathFrom,
	);
	it(
		"leaves the live install linked for the live root written out whole",
		verifyLeavesTheLiveInstallLinkedForTheLiveRoot,
	);
	it(
		"names the live install's root while a directory is linked, so setup can offer it",
		verifyNamesTheLiveInstallSRootWhileADirectory,
	);
	it(
		"refuses a directory holding no corpus and keeps the link",
		verifyRefusesADirectoryHoldingNoCorpusAndKeepsThe,
	);
	it(
		"refuses a directory that does not exist and keeps the link, though the live root is absent too",
		verifyRefusesADirectoryThatDoesNotExistAndKeeps,
	);
	it(
		"refuses a relative path as a bad request naming the absolute-path rule",
		verifyRefusesARelativePathAsABadRequestNaming,
	);
	it(
		"answers with a conflict when the settings file cannot be read, and leaves the file",
		verifyAnswersWithAConflictWhenTheSettingsFileCannot,
	);
});

async function verifyLinksADirectoryInCorpusLayout(): Promise<void> {
	const { send, get } = await harness("missing");
	const corpus = await corpusDirectory();

	const response = await send("PUT", "/api/setup/corpus", {
		directory: corpus,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const after = await reading(get);
	expect(after.linkedCorpus).toEqual({ kind: "directory", root: corpus });
}

async function verifyLeavesTheLiveInstallLinkedForAPathFrom(): Promise<void> {
	const { send, get, home, runsDirectory } = await harness("missing");
	const live = await liveRoot(runsDirectory);
	await mkdir(home, { recursive: true });
	await symlink(live, join(home, ".claude"));
	await send("PUT", "/api/setup/corpus", {
		directory: await corpusDirectory(),
	});

	const response = await send("PUT", "/api/setup/corpus", {
		directory: "~/.claude",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const after = await reading(get);
	expect(after.linkedCorpus.kind).toBe("live");
}

async function verifyLeavesTheLiveInstallLinkedForTheLiveRoot(): Promise<void> {
	const { send, get, runsDirectory } = await harness("missing");
	const live = await liveRoot(runsDirectory);

	const response = await send("PUT", "/api/setup/corpus", {
		directory: `${live}/`,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const after = await reading(get);
	expect(after.linkedCorpus.kind).toBe("live");
}

async function verifyNamesTheLiveInstallSRootWhileADirectory(): Promise<void> {
	const { send, get, runsDirectory } = await harness("missing");
	await send("PUT", "/api/setup/corpus", {
		directory: await corpusDirectory(),
	});

	const response = await get("/api/settings");

	const body = z
		.object({ liveCorpusRoot: z.string() })
		.parse(await response.json());
	expect(body.liveCorpusRoot).toBe(directoryLiveCorpus(runsDirectory).root);
}

async function verifyRefusesADirectoryHoldingNoCorpusAndKeepsThe(): Promise<void> {
	const { send, get } = await harness("missing");
	const linked = await corpusDirectory();
	await send("PUT", "/api/setup/corpus", { directory: linked });

	const response = await send("PUT", "/api/setup/corpus", {
		directory: await temporaryDirectory("rehearse-not-corpus-"),
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	const after = await reading(get);
	expect(after.linkedCorpus.root).toBe(linked);
}

async function verifyRefusesADirectoryThatDoesNotExistAndKeeps(): Promise<void> {
	const { send, get } = await harness("missing");
	const linked = await corpusDirectory();
	await send("PUT", "/api/setup/corpus", { directory: linked });

	const response = await send("PUT", "/api/setup/corpus", {
		directory: join(await temporaryDirectory("rehearse-absent-"), "absent"),
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	const after = await reading(get);
	expect(after.linkedCorpus.root).toBe(linked);
}

async function verifyRefusesARelativePathAsABadRequestNaming(): Promise<void> {
	const { send } = await harness("missing");

	const response = await send("PUT", "/api/setup/corpus", {
		directory: "./corpus",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(refusalSchema.parse(await response.json()).error).toContain(
		"absolute path",
	);
}

async function verifyAnswersWithAConflictWhenTheSettingsFileCannot(): Promise<void> {
	const { send, runsDirectory } = await harness("missing");
	const settingsFile = join(runsDirectory, "settings.json");
	await Bun.write(settingsFile, "not json");

	const response = await send("PUT", "/api/setup/corpus", {
		directory: "",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await Bun.file(settingsFile).text()).toBe("not json");
}

async function verifyLiveCorpusPaths({
	directory,
}: Readonly<(typeof LIVE_CORPUS_PATHS)[number]>): Promise<void> {
	const { send, get } = await harness("missing");
	await send("PUT", "/api/setup/corpus", {
		directory: await corpusDirectory(),
	});

	const response = await send("PUT", "/api/setup/corpus", {
		directory,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const after = await reading(get);
	expect(after.linkedCorpus.kind).toBe("live");
}
