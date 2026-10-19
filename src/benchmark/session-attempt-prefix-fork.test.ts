import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { forkTranscript } from "#benchmark/session-attempt";

import { SOURCE_SESSION } from "./session-attempt-case-test-fixtures";
import { transcriptLine } from "./session-attempt-transcript-test-fixtures";
import { resources } from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function rewritesEveryOccurrenceOfTheSourceSessionIdAndChangesNothingElse(): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-fork-"));
	resources.track(directory);
	const source = join(directory, "source.jsonl");
	const forked = join(directory, "forked.jsonl");
	const bytes = [
		transcriptLine(SOURCE_SESSION, "first"),
		transcriptLine(SOURCE_SESSION, "second"),
	].join("\n");
	await writeFile(source, `${bytes}\n`);

	await forkTranscript(
		{ destinationPath: forked, sourcePath: source },
		SOURCE_SESSION,
		"fresh-uuid",
	);

	expect(await Bun.file(forked).text()).toBe(
		`${bytes.replaceAll(SOURCE_SESSION, "fresh-uuid")}\n`,
	);
}

async function keepsASourceThatEndsWithoutANewlineEndingWithoutOne(): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-fork-"));
	resources.track(directory);
	const source = join(directory, "source.jsonl");
	const forked = join(directory, "forked.jsonl");
	const bytes = [
		transcriptLine(SOURCE_SESSION, "first"),
		transcriptLine(SOURCE_SESSION, "second"),
	].join("\n");
	await writeFile(source, bytes);

	await forkTranscript(
		{ destinationPath: forked, sourcePath: source },
		SOURCE_SESSION,
		"fresh-uuid",
	);

	expect(await Bun.file(forked).text()).toBe(
		bytes.replaceAll(SOURCE_SESSION, "fresh-uuid"),
	);
}
describe(forkTranscript.name, () => {
	it(
		"rewrites every occurrence of the source session id and changes nothing else",
		rewritesEveryOccurrenceOfTheSourceSessionIdAndChangesNothingElse,
	);
	it(
		"keeps a source that ends without a newline ending without one",
		keepsASourceThatEndsWithoutANewlineEndingWithoutOne,
	);
});
