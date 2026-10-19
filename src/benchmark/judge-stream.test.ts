import { describe, expect, it } from "bun:test";

import type { ClosedItem } from "./judge-stream";
import StructuredOutputStream from "./judge-stream";

const DEFAULT_STREAM_CHUNK_CODE_UNITS = 7;

const INITIAL_CONTENT_BLOCK_INDEX = 0;
const OMITTED_JSON_CLOSING_CHARACTER_OFFSET = -1;
const LATER_CONTENT_BLOCK_INDEX = 1;

const PREFIX_START_INDEX = 0;

const STREAM_RESTART_COUNT_INCREMENT = 1;

const SINGLE_ITEM_COUNT = 1;

function blockStart(index: number, name = "StructuredOutput"): string {
	return JSON.stringify({
		event: {
			content_block: { id: "toolu_1", input: {}, name, type: "tool_use" },
			index,
			type: "content_block_start",
		},
		type: "stream_event",
	});
}

function delta(
	partialJson: string,
	index = INITIAL_CONTENT_BLOCK_INDEX,
): string {
	return JSON.stringify({
		event: {
			delta: { partial_json: partialJson, type: "input_json_delta" },
			index,
			type: "content_block_delta",
		},
		type: "stream_event",
	});
}

/** The output split into chunks of a few characters, as the CLI streams it. */
function chunked(
	json: string,
	size = DEFAULT_STREAM_CHUNK_CODE_UNITS,
): string[] {
	const chunks: string[] = [];
	for (let start = 0; start < json.length; start += size) {
		chunks.push(delta(json.slice(start, start + size)));
	}

	return chunks;
}

interface Watched {
	readonly stream: StructuredOutputStream;
	readonly items: ClosedItem[];
	readonly restarts: number[];
}

function watched(): Watched {
	const items: ClosedItem[] = [];
	const restarts: number[] = [];
	const stream = new StructuredOutputStream({
		itemClosed: (item) => {
			items.push(item);
		},
		restarted: () => {
			restarts.push(items.length);
		},
	});

	return { items, restarts, stream };
}

const StructuredOutputStreamReportsEachSectionItemAsItClosesInTheOrderTheModelWroteThem =
	(): void => {
		const { stream, items } = watched();
		const output = JSON.stringify({
			dimensions: [
				{ grade: "B", id: "d1", note: 'a } and a ] inside "quotes"' },
				{ evidence: [{ path: "x" }], grade: "A", id: "d2" },
			],
			hardBlockers: [{ id: "b1", status: "PASS" }],
			summary: "{not an item}",
		});

		// The output never closes, so each item is reported on its own close.
		for (const line of [
			blockStart(INITIAL_CONTENT_BLOCK_INDEX),
			...chunked(
				output.slice(PREFIX_START_INDEX, OMITTED_JSON_CLOSING_CHARACTER_OFFSET),
			),
		]) {
			stream.line(line);
		}

		expect(items).toEqual([
			{
				item: { grade: "B", id: "d1", note: 'a } and a ] inside "quotes"' },
				section: "dimensions",
			},
			{
				item: { evidence: [{ path: "x" }], grade: "A", id: "d2" },
				section: "dimensions",
			},
			{ item: { id: "b1", status: "PASS" }, section: "hardBlockers" },
		]);
	};

const StructuredOutputStreamIgnoresLinesThatAreNotStructuredOutputDeltas =
	(): void => {
		const { stream, items } = watched();

		stream.line("not json");
		stream.line(JSON.stringify({ subtype: "init", type: "system" }));
		stream.line(blockStart(INITIAL_CONTENT_BLOCK_INDEX, "Bash"));
		stream.line(delta('{"dimensions":[{"id":"d1"}]}'));
		stream.line(JSON.stringify({ structured_output: {}, type: "result" }));

		expect(items).toEqual([]);
	};

const StructuredOutputStreamStartsOverWhenTheModelBeginsANewStructuredOutput =
	(): void => {
		const expectedStructuredOutputRestartCount = 1;

		const { stream, items, restarts } = watched();

		stream.line(blockStart(INITIAL_CONTENT_BLOCK_INDEX));
		stream.line(delta('{"dimensions":[{"id":"d1"},'));
		stream.line(blockStart(INITIAL_CONTENT_BLOCK_INDEX));
		stream.line(delta('{"dimensions":[{"id":"d2"}]}'));

		expect(items.map(({ item }) => item)).toEqual([{ id: "d1" }, { id: "d2" }]);
		expect(restarts).toEqual([expectedStructuredOutputRestartCount]);
	};

const StructuredOutputStreamKeepsReportingAfterAListenerFailsOnOneItem =
	(): void => {
		const expectedRestarts = 0;

		const items: ClosedItem[] = [];
		let restarts = 0;
		const stream = new StructuredOutputStream({
			itemClosed: (item) => {
				items.push(item);
				if (items.length === SINGLE_ITEM_COUNT) {
					throw new Error("report failed");
				}
			},
			restarted: () => {
				restarts += STREAM_RESTART_COUNT_INCREMENT;
			},
		});

		for (const line of [
			blockStart(INITIAL_CONTENT_BLOCK_INDEX),
			...chunked(
				'{"dimensions":[{"id":"d1"},{"id":"d2"}],"hardBlockers":[{"id":"b1"}]}',
			),
		]) {
			try {
				stream.line(line);
			} catch {
				// The caller carries on with the next line.
			}
		}

		expect(items.map(({ item }) => item)).toEqual([
			{ id: "d1" },
			{ id: "d2" },
			{ id: "b1" },
		]);
		expect(restarts).toBe(expectedRestarts);
	};

const StructuredOutputStreamReadsOnlyTheStructuredOutputBlocksOwnDeltas =
	(): void => {
		const { stream, items } = watched();

		stream.line(blockStart(LATER_CONTENT_BLOCK_INDEX));
		stream.line(
			delta('{"dimensions":[{"id":"other"}]}', INITIAL_CONTENT_BLOCK_INDEX),
		);
		stream.line(
			delta('{"dimensions":[{"id":"d1"}]}', LATER_CONTENT_BLOCK_INDEX),
		);

		expect(items.map(({ item }) => item)).toEqual([{ id: "d1" }]);
	};

describe(StructuredOutputStream.name, () => {
	it(
		"reports each section item as it closes, in the order the model wrote them",
		StructuredOutputStreamReportsEachSectionItemAsItClosesInTheOrderTheModelWroteThem,
	);

	it(
		"ignores lines that are not structured output deltas",
		StructuredOutputStreamIgnoresLinesThatAreNotStructuredOutputDeltas,
	);

	it(
		"starts over when the model begins a new structured output",
		StructuredOutputStreamStartsOverWhenTheModelBeginsANewStructuredOutput,
	);

	it(
		"keeps reporting after a listener fails on one item",
		StructuredOutputStreamKeepsReportingAfterAListenerFailsOnOneItem,
	);

	it(
		"reads only the structured output block's own deltas",
		StructuredOutputStreamReadsOnlyTheStructuredOutputBlocksOwnDeltas,
	);
});
