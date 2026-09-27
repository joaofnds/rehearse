import { describe, expect, it } from "bun:test";
import type { ClosedItem } from "./judge-stream";
import { StructuredOutputStream } from "./judge-stream";

function blockStart(index: number, name = "StructuredOutput"): string {
	return JSON.stringify({
		type: "stream_event",
		event: {
			type: "content_block_start",
			index,
			content_block: { type: "tool_use", id: "toolu_1", name, input: {} },
		},
	});
}

function delta(partialJson: string, index = 0): string {
	return JSON.stringify({
		type: "stream_event",
		event: {
			type: "content_block_delta",
			index,
			delta: { type: "input_json_delta", partial_json: partialJson },
		},
	});
}

/** The output split into chunks of a few characters, as the CLI streams it. */
function chunked(json: string, size = 7): string[] {
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

	return { stream, items, restarts };
}

describe(StructuredOutputStream.name, () => {
	it("reports each section item as it closes, in the order the model wrote them", () => {
		const { stream, items } = watched();
		const output = JSON.stringify({
			dimensions: [
				{ id: "d1", grade: "B", note: 'a } and a ] inside "quotes"' },
				{ id: "d2", grade: "A", evidence: [{ path: "x" }] },
			],
			hardBlockers: [{ id: "b1", status: "PASS" }],
			summary: "{not an item}",
		});

		const seen: number[] = [];
		for (const line of [blockStart(0), ...chunked(output)]) {
			stream.line(line);
			seen.push(items.length);
		}

		expect(items).toEqual([
			{
				section: "dimensions",
				item: { id: "d1", grade: "B", note: 'a } and a ] inside "quotes"' },
			},
			{
				section: "dimensions",
				item: { id: "d2", grade: "A", evidence: [{ path: "x" }] },
			},
			{ section: "hardBlockers", item: { id: "b1", status: "PASS" } },
		]);
		expect(seen.indexOf(2)).toBeLessThan(seen.indexOf(3));
		expect(seen.at(-1)).toBe(3);
	});

	it("ignores lines that are not structured output deltas", () => {
		const { stream, items } = watched();

		stream.line("not json");
		stream.line(JSON.stringify({ type: "system", subtype: "init" }));
		stream.line(blockStart(0, "Bash"));
		stream.line(delta('{"dimensions":[{"id":"d1"}]}'));
		stream.line(JSON.stringify({ type: "result", structured_output: {} }));

		expect(items).toEqual([]);
	});

	it("starts over when the model begins a new structured output", () => {
		const { stream, items, restarts } = watched();

		stream.line(blockStart(0));
		stream.line(delta('{"dimensions":[{"id":"d1"},'));
		stream.line(blockStart(0));
		stream.line(delta('{"dimensions":[{"id":"d2"}]}'));

		expect(items.map(({ item }) => item)).toEqual([{ id: "d1" }, { id: "d2" }]);
		expect(restarts).toEqual([1]);
	});

	it("reads only the structured output block's own deltas", () => {
		const { stream, items } = watched();

		stream.line(blockStart(1));
		stream.line(delta('{"dimensions":[{"id":"other"}]}', 0));
		stream.line(delta('{"dimensions":[{"id":"d1"}]}', 1));

		expect(items.map(({ item }) => item)).toEqual([{ id: "d1" }]);
	});
});
