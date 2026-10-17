import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CorpusFileError, hashCorpusFiles } from "./corpus-file";
import { SymlinkedEntryError } from "./file-presence";
import type { DirectoryCorpusRoot } from "./corpus-file";
import { withCorpusReadScope } from "./corpus-read-scope";
import { TestResources } from "./test-support";

function digest(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

describe(withCorpusReadScope.name, () => {
	const resources = TestResources.forEachTest();

	async function source(text: string): Promise<DirectoryCorpusRoot> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-read-scope-"));
		resources.track(root);
		await Bun.write(join(root, "CLAUDE.md"), text);

		return { kind: "directory", root };
	}

	it("reuses a file reading in nested reports and reads edits again in the next report", async () => {
		const corpus = await source("before");

		const repeated = await withCorpusReadScope(async () => {
			await hashCorpusFiles(corpus, ["CLAUDE.md"]);
			await Bun.write(join(corpus.root, "CLAUDE.md"), "after");

			return withCorpusReadScope(() => hashCorpusFiles(corpus, ["CLAUDE.md"]));
		});
		const next = await withCorpusReadScope(() =>
			hashCorpusFiles(corpus, ["CLAUDE.md"]),
		);

		expect(repeated.map(({ sha256 }) => sha256)).toEqual([digest("before")]);
		expect(next.map(({ sha256 }) => sha256)).toEqual([digest("after")]);
	});

	it("keeps simultaneous reports independent", async () => {
		const corpus = await source("before");
		const firstRead = Promise.withResolvers<undefined>();
		const secondRead = Promise.withResolvers<undefined>();

		const [first, second] = await Promise.all([
			withCorpusReadScope(async () => {
				await hashCorpusFiles(corpus, ["CLAUDE.md"]);
				firstRead.resolve(undefined);
				await secondRead.promise;

				return hashCorpusFiles(corpus, ["CLAUDE.md"]);
			}),
			withCorpusReadScope(async () => {
				await firstRead.promise;
				try {
					await Bun.write(join(corpus.root, "CLAUDE.md"), "after");

					return await hashCorpusFiles(corpus, ["CLAUDE.md"]);
				} finally {
					secondRead.resolve(undefined);
				}
			}),
		]);

		expect(first.map(({ sha256 }) => sha256)).toEqual([digest("before")]);
		expect(second.map(({ sha256 }) => sha256)).toEqual([digest("after")]);
	});

	it("keeps corpus sources separate inside a report", async () => {
		const first = await source("first");
		const second = await source("second");

		const files = await withCorpusReadScope(async () => [
			...(await hashCorpusFiles(first, ["CLAUDE.md"])),
			...(await hashCorpusFiles(second, ["CLAUDE.md"])),
		]);

		expect(files.map(({ sha256 }) => sha256)).toEqual([
			digest("first"),
			digest("second"),
		]);
	});

	it("rechecks containment and absence after a report ends", async () => {
		const corpus = await source("before");
		const outside = await source("outside");
		const file = join(corpus.root, "CLAUDE.md");
		await withCorpusReadScope(() => hashCorpusFiles(corpus, ["CLAUDE.md"]));
		await rm(file);

		expect(
			withCorpusReadScope(() => hashCorpusFiles(corpus, ["CLAUDE.md"])),
		).rejects.toThrow(CorpusFileError);
		await symlink(join(outside.root, "CLAUDE.md"), file);
		expect(
			withCorpusReadScope(() => hashCorpusFiles(corpus, ["CLAUDE.md"])),
		).rejects.toThrow(SymlinkedEntryError);
		await rm(file);
		await Bun.write(file, "restored");

		const restored = await withCorpusReadScope(() =>
			hashCorpusFiles(corpus, ["CLAUDE.md"]),
		);
		expect(restored.map(({ sha256 }) => sha256)).toEqual([digest("restored")]);
	});
});
