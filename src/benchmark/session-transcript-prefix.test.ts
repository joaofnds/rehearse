import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	CaptureError,
	captureTranscriptPrefix,
} from "#benchmark/session-capture";
import { TestResources } from "#benchmark/test-support";
import { failureOf } from "#cli/cli-test-support";

import CaptureTranscriptBuilder from "./capture-transcript-test-builder";

const SHORT_CAPTURE_PREFIX_LINE_COUNT = 3;
const LONG_CAPTURE_PREFIX_LINE_COUNT = 399;
const PREFIX_START_INDEX = 0;
const OBSERVATION_COUNT_INCREMENT = 1;
const ONE_MEBIBYTE_BYTES = 1_048_576;
const ONE_CHUNK_AND_A_LINE = 786_432;
const ZERO_TRANSCRIPT_CUT = 0;
const NEGATIVE_TRANSCRIPT_CUT = -1;
const NONPOSITIVE_TRANSCRIPT_CUTS: readonly [number, number] = [
	ZERO_TRANSCRIPT_CUT,
	NEGATIVE_TRANSCRIPT_CUT,
];
const testResources = TestResources.forEachTest();
const writesExactlyTheSourcesFirstCutLines = async (): Promise<void> => {
	const path = await new CaptureTranscriptBuilder({ lines: 5 }).source(
		testResources,
	);
	const target = await CaptureTranscriptBuilder.destination(testResources);

	await captureTranscriptPrefix({
		cut: 3,
		destinationPath: target,
		sourcePath: path,
	});

	const written = await Bun.file(target).text();
	const original = await Bun.file(path).text();

	expect(written).toBe(
		`${original.split("\n").slice(PREFIX_START_INDEX, SHORT_CAPTURE_PREFIX_LINE_COUNT).join("\n")}\n`,
	);
};
const countsJSONLRecordsRatherThanBlankPhysicalLinesAtThe =
	async (): Promise<void> => {
		const expectedLines = 2;

		const directory = await mkdtemp(join(tmpdir(), "rehearse-source-"));
		testResources.track(directory);
		const path = join(directory, "source.jsonl");
		await writeFile(path, '{"ordinal":0}\n\n{"ordinal":1}\n{"ordinal":2}\n');
		const target = await CaptureTranscriptBuilder.destination(testResources);

		const captured = await captureTranscriptPrefix({
			cut: 2,
			destinationPath: target,
			sourcePath: path,
		});

		expect(captured.lines).toBe(expectedLines);
		expect(await Bun.file(target).text()).toBe(
			'{"ordinal":0}\n\n{"ordinal":1}\n',
		);
	};
const writesAPrefixByteidenticalToTheSourcesFirstLinesWhen =
	async (): Promise<void> => {
		const path = await new CaptureTranscriptBuilder({ lines: 400 }).source(
			testResources,
		);
		const target = await CaptureTranscriptBuilder.destination(testResources);

		await captureTranscriptPrefix({
			cut: 399,
			destinationPath: target,
			sourcePath: path,
		});

		const written = await Bun.file(target).text();
		const original = await Bun.file(path).text();

		expect(written.length).toBeGreaterThan(ONE_MEBIBYTE_BYTES);
		expect(written).toBe(
			`${original.split("\n").slice(PREFIX_START_INDEX, LONG_CAPTURE_PREFIX_LINE_COUNT).join("\n")}\n`,
		);
	};
const neverHoldsTheWholeSourceOnlyOneReadChunkAnd = async (): Promise<void> => {
	const lowerBoundForObservations = 1;

	const path = await new CaptureTranscriptBuilder({ lines: 400 }).source(
		testResources,
	);
	const sourceBytes = Bun.file(path).size;
	let widest = 0;
	let observations = 0;

	await captureTranscriptPrefix(
		{
			cut: 399,
			destinationPath:
				await CaptureTranscriptBuilder.destination(testResources),
			sourcePath: path,
		},
		{
			carry: (characters) => {
				observations += OBSERVATION_COUNT_INCREMENT;
				widest = Math.max(widest, characters);
			},
		},
	);

	expect(sourceBytes).toBeGreaterThan(ONE_MEBIBYTE_BYTES);
	expect(observations).toBeGreaterThan(lowerBoundForObservations);
	expect(widest).toBeLessThan(ONE_CHUNK_AND_A_LINE);
};
const returnsTheDigestOfTheBytesItWrote = async (): Promise<void> => {
	const path = await new CaptureTranscriptBuilder({ lines: 4 }).source(
		testResources,
	);
	const target = await CaptureTranscriptBuilder.destination(testResources);

	const result = await captureTranscriptPrefix({
		cut: 2,
		destinationPath: target,
		sourcePath: path,
	});

	expect(result.sha256).toBe(
		new Bun.CryptoHasher("sha256")
			.update(await Bun.file(target).bytes())
			.digest("hex"),
	);
};
const refusesACutOfPNamingTheIndexAndThe = async (
	cut: number,
): Promise<void> => {
	const path = await new CaptureTranscriptBuilder({ lines: 4 }).source(
		testResources,
	);

	expect(
		captureTranscriptPrefix({
			cut,
			destinationPath:
				await CaptureTranscriptBuilder.destination(testResources),
			sourcePath: path,
		}),
	).rejects.toThrow(`Cut ${String(cut)} is outside the source's 4 lines`);
};
const refusesACutPastTheSourcesLineCountNamingBoth =
	async (): Promise<void> => {
		const path = await new CaptureTranscriptBuilder({ lines: 4 }).source(
			testResources,
		);

		expect(
			captureTranscriptPrefix({
				cut: 5,
				destinationPath:
					await CaptureTranscriptBuilder.destination(testResources),
				sourcePath: path,
			}),
		).rejects.toThrow("Cut 5 is outside the source's 4 lines");
	};
const writesNothingWhenItRefusesTheCut = async (): Promise<void> => {
	const path = await new CaptureTranscriptBuilder({ lines: 4 }).source(
		testResources,
	);
	const target = await CaptureTranscriptBuilder.destination(testResources);

	const failure = await failureOf(
		captureTranscriptPrefix({
			cut: 99,
			destinationPath: target,
			sourcePath: path,
		}),
	);
	const exists = await Bun.file(target).exists();

	expect(failure).toBeInstanceOf(CaptureError);
	expect(exists).toBe(false);
};
const refusesWithACaptureErrorSoTheCLICanMapIt = async (): Promise<void> => {
	const path = await new CaptureTranscriptBuilder({ lines: 2 }).source(
		testResources,
	);

	expect(
		captureTranscriptPrefix({
			cut: 0,
			destinationPath:
				await CaptureTranscriptBuilder.destination(testResources),
			sourcePath: path,
		}),
	).rejects.toBeInstanceOf(CaptureError);
};
describe(captureTranscriptPrefix.name, () => {
	it(
		"writes exactly the source's first cut lines",
		writesExactlyTheSourcesFirstCutLines,
	);
	it(
		"counts JSONL records rather than blank physical lines at the cut",
		countsJSONLRecordsRatherThanBlankPhysicalLinesAtThe,
	);
	it(
		"writes a prefix byte-identical to the source's first lines when the source exceeds one read buffer",
		writesAPrefixByteidenticalToTheSourcesFirstLinesWhen,
	);
	it(
		"never holds the whole source, only one read chunk and a partial line",
		neverHoldsTheWholeSourceOnlyOneReadChunkAnd,
	);
	it(
		"returns the digest of the bytes it wrote",
		returnsTheDigestOfTheBytesItWrote,
	);
	it.each([...NONPOSITIVE_TRANSCRIPT_CUTS])(
		"refuses a cut of %p, naming the index and the line count",
		refusesACutOfPNamingTheIndexAndThe,
	);
	it(
		"refuses a cut past the source's line count, naming both",
		refusesACutPastTheSourcesLineCountNamingBoth,
	);
	it(
		"writes nothing when it refuses the cut",
		writesNothingWhenItRefusesTheCut,
	);
	it(
		"refuses with a CaptureError so the CLI can map it to an exit code",
		refusesWithACaptureErrorSoTheCLICanMapIt,
	);
});
