import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TestResources } from "#benchmark/test-support";
import { parseTranscriptFile, toolUses } from "#benchmark/transcript";

import {
	assistantWith,
	bashBlock,
	line,
	readBlock,
} from "./transcript-test-fixtures";

const STREAMING_FIXTURE_MINIMUM_BYTES = 1_048_576;

const MINIMUM_STREAMING_OBSERVATIONS = 1;

const PERSISTED_DETAIL_CHARACTERS = 4096;

const OBSERVATION_COUNT_INCREMENT = 1;

const testResources = TestResources.forEachTest();

async function transcriptFile(lines: readonly string[]): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-transcript-"));
	testResources.track(directory);
	const path = join(directory, "transcript.jsonl");
	await writeFile(path, `${lines.join("\n")}\n`);

	return path;
}

function filler(ordinal: number): string {
	return line({
		filler: "x".repeat(PERSISTED_DETAIL_CHARACTERS),
		ordinal,
		type: "user",
	});
}

/**
 * ACT-25's resumed cases carry real multi-megabyte transcripts, so this
 * reads like the capture path rather than holding the file as one string.
 * An observer that is never called leaves the count at zero, which is what
 * a non-streaming subject would do.
 */
const ONE_CHUNK_AND_A_LINE = 786_432;

async function readsTheToolCallsOfATranscriptOnDisk(): Promise<void> {
	const path = await transcriptFile([
		assistantWith({ text: "thinking", type: "text" }, readBlock),
		assistantWith(bashBlock),
	]);

	const transcript = await parseTranscriptFile(path);

	expect(toolUses(transcript).map(({ name }) => name)).toEqual([
		"Read",
		"Bash",
	]);
}

async function readsAnAbsentTranscriptAsOneWithNoRecords(): Promise<void> {
	expect(await parseTranscriptFile("/no/such/transcript.jsonl")).toEqual([]);
}

async function neverHoldsTheWholeTranscriptOnlyOneReadChunkAndAPartialLine(): Promise<void> {
	const path = await transcriptFile(
		Array.from({ length: 400 }, (_value, index) => filler(index)),
	);
	let widest = 0;
	let observations = 0;

	await parseTranscriptFile(path, {
		carry: (characters) => {
			observations += OBSERVATION_COUNT_INCREMENT;
			widest = Math.max(widest, characters);
		},
	});

	expect(Bun.file(path).size).toBeGreaterThan(STREAMING_FIXTURE_MINIMUM_BYTES);
	expect(observations).toBeGreaterThan(MINIMUM_STREAMING_OBSERVATIONS);
	expect(widest).toBeLessThan(ONE_CHUNK_AND_A_LINE);
}

describe(parseTranscriptFile.name, () => {
	it(
		"reads the tool calls of a transcript on disk",
		readsTheToolCallsOfATranscriptOnDisk,
	);
	it(
		"reads an absent transcript as one with no records",
		readsAnAbsentTranscriptAsOneWithNoRecords,
	);
	it(
		"never holds the whole transcript, only one read chunk and a partial line",
		neverHoldsTheWholeTranscriptOnlyOneReadChunkAndAPartialLine,
	);
});
