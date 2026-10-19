import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CorpusFileError, hashCorpusFiles } from "./corpus-file";
import type { DirectoryCorpusRoot } from "./corpus-file";
import { withCorpusReadScope } from "./corpus-read-scope";
import { SymlinkedEntryError } from "./file-presence";
import { TestResources } from "./test-support";

function digest(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

class CorpusReadWorkspace {
	readonly #resources: Readonly<Pick<TestResources, "track">>;
	public constructor(resources: Readonly<Pick<TestResources, "track">>) {
		this.#resources = resources;
	}
	public async source(text: string): Promise<DirectoryCorpusRoot> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-read-scope-"));
		this.#resources.track(root);
		await Bun.write(join(root, "CLAUDE.md"), text);

		return { kind: "directory", root };
	}
	public async pair(
		firstText: string,
		secondText: string,
	): Promise<{
		readonly first: DirectoryCorpusRoot;
		readonly second: DirectoryCorpusRoot;
		readonly firstFile: string;
	}> {
		const first = await this.source(firstText);
		const second = await this.source(secondText);

		return { first, firstFile: join(first.root, "CLAUDE.md"), second };
	}
}

const workspace = new CorpusReadWorkspace(TestResources.forEachTest());

const withCorpusReadScopeReusesAFileReadingInNestedReportsAndReadsEditsAgainInTheNextReport =
	async (): Promise<void> => {
		const corpus = await workspace.source("before");

		const repeated = await withCorpusReadScope(async () => {
			await hashCorpusFiles(corpus, ["CLAUDE.md"]);
			await Bun.write(join(corpus.root, "CLAUDE.md"), "after");

			return await withCorpusReadScope(
				async () => await hashCorpusFiles(corpus, ["CLAUDE.md"]),
			);
		});
		const next = await withCorpusReadScope(
			async () => await hashCorpusFiles(corpus, ["CLAUDE.md"]),
		);

		expect(repeated.map(({ sha256 }) => sha256)).toEqual([digest("before")]);
		expect(next.map(({ sha256 }) => sha256)).toEqual([digest("after")]);
	};

const withCorpusReadScopeKeepsSimultaneousReportsIndependent =
	async (): Promise<void> => {
		const corpus = await workspace.source("before");
		const firstRead = Promise.withResolvers<undefined>();
		const secondRead = Promise.withResolvers<undefined>();

		const [first, second] = await Promise.all([
			withCorpusReadScope(async () => {
				await hashCorpusFiles(corpus, ["CLAUDE.md"]);
				firstRead.resolve();
				await secondRead.promise;

				return await hashCorpusFiles(corpus, ["CLAUDE.md"]);
			}),
			withCorpusReadScope(async () => {
				await firstRead.promise;
				try {
					await Bun.write(join(corpus.root, "CLAUDE.md"), "after");

					return await hashCorpusFiles(corpus, ["CLAUDE.md"]);
				} finally {
					secondRead.resolve();
				}
			}),
		]);

		expect(first.map(({ sha256 }) => sha256)).toEqual([digest("before")]);
		expect(second.map(({ sha256 }) => sha256)).toEqual([digest("after")]);
	};

const withCorpusReadScopeKeepsCorpusSourcesSeparateInsideAReport =
	async (): Promise<void> => {
		const first = await workspace.source("first");
		const second = await workspace.source("second");

		const files = await withCorpusReadScope(async () => [
			...(await hashCorpusFiles(first, ["CLAUDE.md"])),
			...(await hashCorpusFiles(second, ["CLAUDE.md"])),
		]);

		expect(files.map(({ sha256 }) => sha256)).toEqual([
			digest("first"),
			digest("second"),
		]);
	};

const withCorpusReadScopeRechecksContainmentAndAbsenceAfterAReportEnds =
	async (): Promise<void> => {
		const {
			first: corpus,
			second: outside,
			firstFile: file,
		} = await workspace.pair("before", "outside");

		await withCorpusReadScope(
			async () => await hashCorpusFiles(corpus, ["CLAUDE.md"]),
		);
		await rm(file);

		expect(
			withCorpusReadScope(
				async () => await hashCorpusFiles(corpus, ["CLAUDE.md"]),
			),
		).rejects.toThrow(CorpusFileError);
		await symlink(join(outside.root, "CLAUDE.md"), file);
		expect(
			withCorpusReadScope(
				async () => await hashCorpusFiles(corpus, ["CLAUDE.md"]),
			),
		).rejects.toThrow(SymlinkedEntryError);
		await rm(file);
		await Bun.write(file, "restored");

		const restored = await withCorpusReadScope(
			async () => await hashCorpusFiles(corpus, ["CLAUDE.md"]),
		);
		expect(restored.map(({ sha256 }) => sha256)).toEqual([digest("restored")]);
	};

describe(withCorpusReadScope.name, () => {
	it(
		"reuses a file reading in nested reports and reads edits again in the next report",
		withCorpusReadScopeReusesAFileReadingInNestedReportsAndReadsEditsAgainInTheNextReport,
	);

	it(
		"keeps simultaneous reports independent",
		withCorpusReadScopeKeepsSimultaneousReportsIndependent,
	);

	it(
		"keeps corpus sources separate inside a report",
		withCorpusReadScopeKeepsCorpusSourcesSeparateInsideAReport,
	);

	it(
		"rechecks containment and absence after a report ends",
		withCorpusReadScopeRechecksContainmentAndAbsenceAfterAReportEnds,
	);
});
