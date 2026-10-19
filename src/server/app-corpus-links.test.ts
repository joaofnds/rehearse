import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { UNLINK_CORPUS_COMMAND } from "#benchmark/settings";
import createAppServer from "#server/app";
import {
	clearAppRoots,
	corpusDirectory,
	linkedServer,
	sameOrigin,
	vanishedLink,
} from "#server/app-test-fixture";

afterEach(clearAppRoots);

const foreign = { ...sameOrigin, origin: "https://evil.example" };

describe(createAppServer.name, () => {
	describe("when a request writes", () => {
		describe("to link a corpus directory", () => {
			it(
				"measures the linked directory from the next read on",
				verifyMeasuresTheLinkedDirectoryFromTheNextReadOn,
			);

			it(
				"returns to the live install once unlinked",
				verifyReturnsToTheLiveInstallOnceUnlinked,
			);

			describe(
				"from a foreign Origin",
				registerAppCorpusLinksFromAForeignOrigin,
			);

			describe(
				"once the linked directory is gone",
				registerAppCorpusLinksOnceTheLinkedDirectoryIsGone,
			);
		});
	});
});

async function verifyMeasuresTheLinkedDirectoryFromTheNextReadOn(): Promise<void> {
	const { corpusReading, changeLink } = await linkedServer();
	const first = await corpusDirectory();
	const second = await corpusDirectory("other instructions\n");
	await changeLink("PUT", { directory: first });
	const before = await corpusReading();

	const linked = await changeLink("PUT", { directory: second });
	const after = await corpusReading();

	expect(linked.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect([before.root, after.root]).toEqual([first, second]);
	expect(corpusVersionLabel(after.digest)).not.toBe(
		corpusVersionLabel(before.digest),
	);
}

async function verifyReturnsToTheLiveInstallOnceUnlinked(): Promise<void> {
	const { corpusReading, changeLink, liveRoot } = await linkedServer();
	await changeLink("PUT", { directory: await corpusDirectory() });

	const unlinked = await changeLink("DELETE", {});
	const reading = await corpusReading();

	expect(unlinked.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(reading.root).toBe(liveRoot);
}

async function verifyLinksNothing(): Promise<void> {
	const { corpusReading, changeLink, liveRoot } = await linkedServer();

	const response = await changeLink(
		"PUT",
		{ directory: await corpusDirectory() },
		foreign,
	);
	const reading = await corpusReading();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
	expect(reading.root).toBe(liveRoot);
}

async function verifyUnlinksNothing(): Promise<void> {
	const { corpusReading, changeLink } = await linkedServer();
	const directory = await corpusDirectory();
	await changeLink("PUT", { directory });

	const response = await changeLink("DELETE", {}, foreign);
	const reading = await corpusReading();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
	expect(reading.root).toBe(directory);
}

async function verifyStoresNoCeiling(): Promise<void> {
	const { store, read } = await linkedServer();

	const response = await store({ usd: 9 }, foreign);
	const reading = await read("/api/settings");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
	expect(await reading.json()).toMatchObject({ spendCeilingUsd: 5 });
}

async function verifyStillReadsTheSettingsNamingTheDirectoryThatIs(): Promise<void> {
	const { server, directory } = await vanishedLink();

	const response = await server.read("/api/settings");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		linkedCorpus: { kind: "directory", root: directory },
	});
}

async function verifyStoresACeilingAndAnswersThatItDid(): Promise<void> {
	const { server } = await vanishedLink();

	const response = await server.store({ usd: 3 });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({ spendCeilingUsd: 3 });
}

function registerAppCorpusLinksFromAForeignOrigin(): void {
	it("links nothing", verifyLinksNothing);

	it("unlinks nothing", verifyUnlinksNothing);

	it("stores no ceiling", verifyStoresNoCeiling);
}

function registerAppCorpusLinksOnceTheLinkedDirectoryIsGone(): void {
	it.each(["/api/runs", "/api/corpus", "/api/corpus/versions"])(
		"refuses %s naming the command that unlinks it",
		async (path) => {
			const { server } = await vanishedLink();

			const response = await server.read(path);

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
			expect(await response.text()).toContain(UNLINK_CORPUS_COMMAND);
		},
	);

	it(
		"still reads the settings, naming the directory that is linked",
		verifyStillReadsTheSettingsNamingTheDirectoryThatIs,
	);

	it(
		"stores a ceiling and answers that it did",
		verifyStoresACeilingAndAnswersThatItDid,
	);
}
