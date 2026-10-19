import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { recordsDirectory } from "#benchmark/config";
import { liveCorpusSource } from "#benchmark/corpus-file";
import {
	CorpusSourceError,
	linkCorpus,
	linkedCorpusSource,
	resolveCorpusSource,
	unlinkCorpus,
} from "#benchmark/corpus-source";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { UNLINK_CORPUS_COMMAND } from "#benchmark/settings";
import { failureOf } from "#cli/cli-test-support";

import CorpusSourceWorkspace from "./corpus-source-workspace-test-fixture";

const workspace = CorpusSourceWorkspace.forEachTest();
const resolvingTheCorpusNobodyNamesResolvesToTheLinkedDirectory =
	async (): Promise<void> => {
		const root = await workspace.directoryCorpus();
		await linkCorpus(recordsDirectory(), root);

		const source = await resolveCorpusSource();

		expect(source).toEqual({ kind: "directory", root });
	};
const resolvingTheCorpusNobodyNamesResolvesToTheLiveInstallOnceTheCorpusIsUnlinked =
	async (): Promise<void> => {
		await linkCorpus(recordsDirectory(), await workspace.directoryCorpus());

		await unlinkCorpus(recordsDirectory());

		expect(await resolveCorpusSource()).toEqual(liveCorpusSource());
	};
const resolvingTheCorpusNobodyNamesRefusesALinkedDirectoryThatIsGoneNamingTheCommandThat =
	async (): Promise<void> => {
		const root = await workspace.directoryCorpus();
		await linkCorpus(recordsDirectory(), root);
		await rm(root, { recursive: true });

		const failure = await failureOf(resolveCorpusSource());

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(root);
		expect(failure.message).toContain(UNLINK_CORPUS_COMMAND);
	};
const linkCorpusStoresTheDirectoryAsTheLinkedCorpus =
	async (): Promise<void> => {
		const directory = await workspace.records();
		const root = await workspace.directoryCorpus();

		await linkCorpus(directory, root);

		expect(await linkedCorpusSource(directory)).toEqual({
			kind: "directory",
			root,
		});
	};

const linkCorpusLeavesTheLiveInstallLinkedInRecordsThatNeverLinkedOne =
	async (): Promise<void> => {
		expect(await linkedCorpusSource(await workspace.records())).toEqual(
			liveCorpusSource(),
		);
	};

const linkCorpusRefusesADirectoryHoldingNoCorpusAndKeepsTheLinkItHad =
	async (): Promise<void> => {
		const directory = await workspace.records();
		const root = await workspace.directoryCorpus();

		await linkCorpus(directory, root);
		const notCorpus = await workspace.emptyDirectory();

		const failure = await failureOf(linkCorpus(directory, notCorpus));

		expect(failure).toBeInstanceOf(CorpusSourceError);
		expect(await linkedCorpusSource(directory)).toEqual({
			kind: "directory",
			root,
		});
	};

const linkCorpusRefusesADirectoryWhoseFilesResolveOutsideItNamingWhyAndKeepsTheLinkItHad =
	async (): Promise<void> => {
		const directory = await workspace.records();
		const root = await workspace.directoryCorpus();

		await linkCorpus(directory, root);
		const unmeasurable = await workspace.escapingCorpus();

		const failure = await failureOf(linkCorpus(directory, unmeasurable));

		expect(failure).toBeInstanceOf(CorpusSourceError);
		expect(failure.message).toContain(
			"Corpus file CLAUDE.md resolves outside the corpus source",
		);
		expect(await linkedCorpusSource(directory)).toEqual({
			kind: "directory",
			root,
		});
	};

describe("resolving the corpus nobody names", () => {
	afterEach(async () => {
		await unlinkCorpus(recordsDirectory());
	});

	it(
		"resolves to the linked directory",
		resolvingTheCorpusNobodyNamesResolvesToTheLinkedDirectory,
	);

	it(
		"resolves to the live install once the corpus is unlinked",
		resolvingTheCorpusNobodyNamesResolvesToTheLiveInstallOnceTheCorpusIsUnlinked,
	);

	it(
		"refuses a linked directory that is gone, naming the command that unlinks it",
		resolvingTheCorpusNobodyNamesRefusesALinkedDirectoryThatIsGoneNamingTheCommandThat,
	);
});
describe(linkCorpus.name, () => {
	it(
		"stores the directory as the linked corpus",
		linkCorpusStoresTheDirectoryAsTheLinkedCorpus,
	);

	it(
		"leaves the live install linked in records that never linked one",
		linkCorpusLeavesTheLiveInstallLinkedInRecordsThatNeverLinkedOne,
	);

	it(
		"refuses a directory holding no corpus and keeps the link it had",
		linkCorpusRefusesADirectoryHoldingNoCorpusAndKeepsTheLinkItHad,
	);
	it(
		"refuses a directory whose files resolve outside it, naming why, and keeps the link it had",
		linkCorpusRefusesADirectoryWhoseFilesResolveOutsideItNamingWhyAndKeepsTheLinkItHad,
	);
});
