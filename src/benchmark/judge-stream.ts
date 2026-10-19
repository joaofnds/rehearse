import { z } from "zod";

import type { Immutable } from "./contracts";
import parseJsonDocument from "./json-document";
import StructuredItemScanner from "./structured-output-item-scanner";
import type { ClosedItem } from "./structured-output-item-scanner";

interface StructuredOutputListener {
	readonly itemClosed: (item: ClosedItem) => void;
	/** The model began its structured output again, so earlier items are void. */
	readonly restarted: () => void;
}

const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

const contentBlockStartSchema = z.object({
	content_block: z.looseObject({
		name: z.string().optional(),
		type: z.string(),
	}),
	index: z.number(),
	type: z.literal("content_block_start"),
});

const contentBlockDeltaSchema = z.object({
	delta: z.looseObject({
		partial_json: z.string().optional(),
		type: z.string(),
	}),
	index: z.number(),
	type: z.literal("content_block_delta"),
});

const streamEventSchema = z.object({
	event: z.discriminatedUnion("type", [
		contentBlockStartSchema,
		contentBlockDeltaSchema,
	]),
	type: z.literal("stream_event"),
});

type StreamEvent = z.infer<typeof streamEventSchema>["event"];

function streamEvent(line: string): StreamEvent | undefined {
	const documentReading = parseJsonDocument(line, streamEventSchema);
	if (documentReading.kind === "invalid-json") {
		return undefined;
	}

	const { parsed: event } = documentReading;

	return event.success ? event.data.event : undefined;
}

/**
 * Reads a judge's structured output while the CLI streams it
 * (`--output-format stream-json --include-partial-messages`) and reports each
 * item of a top-level array as soon as its closing brace arrives. The CLI
 * streams the output as `input_json_delta` chunks of its `StructuredOutput`
 * tool call, split at arbitrary characters, so the reader tracks strings and
 * nesting itself rather than parsing a document that is not whole yet.
 */

class StructuredOutputStream {
	private scanner: StructuredItemScanner | undefined;
	private block: number | undefined;

	public constructor(private readonly listener: StructuredOutputListener) {}

	/** One line of the CLI's stream-json output. */
	public line(text: string): void {
		const event = streamEvent(text);
		if (event === undefined) {
			return;
		}

		if (event.type === "content_block_start") {
			this.startBlock(event);
			return;
		}

		const chunk = event.delta.partial_json;
		if (event.index === this.block && chunk !== undefined) {
			this.scanner?.feed(chunk);
		}
	}
	private startBlock(
		event: Immutable<z.infer<typeof contentBlockStartSchema>>,
	): void {
		if (event.content_block.name !== STRUCTURED_OUTPUT_TOOL) {
			return;
		}

		const restarting = this.scanner !== undefined;
		this.block = event.index;
		this.scanner = new StructuredItemScanner(this.listener.itemClosed);
		if (restarting) {
			this.listener.restarted();
		}
	}
}

export { StructuredOutputStream as default };
export type { StructuredOutputListener };
export type { ClosedItem } from "./structured-output-item-scanner";
