import { z } from "zod";

/**
 * Reads a judge's structured output while the CLI streams it
 * (`--output-format stream-json --include-partial-messages`) and reports each
 * item of a top-level array as soon as its closing brace arrives. The CLI
 * streams the output as `input_json_delta` chunks of its `StructuredOutput`
 * tool call, split at arbitrary characters, so the reader tracks strings and
 * nesting itself rather than parsing a document that is not whole yet.
 */

export interface ClosedItem {
	/** The top-level key whose array holds the item. */
	readonly section: string;
	readonly item: unknown;
}

export interface StructuredOutputListener {
	readonly itemClosed: (item: ClosedItem) => void;
	/** The model began its structured output again, so earlier items are void. */
	readonly restarted: () => void;
}

const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

const streamEventSchema = z.object({
	type: z.literal("stream_event"),
	event: z.discriminatedUnion("type", [
		z.object({
			type: z.literal("content_block_start"),
			index: z.number(),
			content_block: z.looseObject({
				type: z.string(),
				name: z.string().optional(),
			}),
		}),
		z.object({
			type: z.literal("content_block_delta"),
			index: z.number(),
			delta: z.looseObject({
				type: z.string(),
				partial_json: z.string().optional(),
			}),
		}),
	]),
});

type StreamEvent = z.infer<typeof streamEventSchema>["event"];

function streamEvent(line: string): StreamEvent | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return undefined;
	}
	const event = streamEventSchema.safeParse(parsed);

	return event.success ? event.data.event : undefined;
}

/** Depth 1 is inside the output object, depth 2 inside a section's array. */
const SECTION_DEPTH = 2;

interface ItemScanner {
	readonly feed: (chunk: string) => void;
}

function itemScanner(itemClosed: (item: ClosedItem) => void): ItemScanner {
	let text = "";
	let position = 0;
	let depth = 0;
	let inString = false;
	let escaped = false;
	let stringStart = 0;
	let lastKey = "";
	let section: string | undefined;
	let itemStart = 0;

	const scanString = (character: string): void => {
		if (escaped) {
			escaped = false;
		} else if (character === "\\") {
			escaped = true;
		} else if (character === '"') {
			inString = false;
			if (depth === 1) {
				lastKey = z
					.string()
					.parse(JSON.parse(text.slice(stringStart, position + 1)));
			}
		}
	};

	const scan = (character: string): void => {
		if (inString) {
			scanString(character);

			return;
		}

		switch (character) {
			case '"': {
				inString = true;
				stringStart = position;
				break;
			}
			case "[": {
				if (depth === 1) {
					section = lastKey;
				}
				depth += 1;
				break;
			}
			case "{": {
				if (depth === SECTION_DEPTH && section !== undefined) {
					itemStart = position;
				}
				depth += 1;
				break;
			}
			case "}": {
				depth -= 1;
				if (depth === SECTION_DEPTH && section !== undefined) {
					itemClosed({
						section,
						item: JSON.parse(text.slice(itemStart, position + 1)),
					});
				}
				break;
			}
			case "]": {
				depth -= 1;
				if (depth === 1) {
					section = undefined;
				}
				break;
			}
			default: {
				break;
			}
		}
	};

	return {
		feed: (chunk) => {
			text += chunk;
			for (; position < text.length; position += 1) {
				scan(text.charAt(position));
			}
		},
	};
}

export class StructuredOutputStream {
	private scanner: ItemScanner | undefined;
	private block: number | undefined;

	public constructor(private readonly listener: StructuredOutputListener) {}

	/** One line of the CLI's stream-json output. */
	public line(text: string): void {
		const event = streamEvent(text);
		if (event === undefined) {
			return;
		}

		if (event.type === "content_block_start") {
			if (event.content_block.name !== STRUCTURED_OUTPUT_TOOL) {
				return;
			}
			if (this.scanner !== undefined) {
				this.listener.restarted();
			}
			this.block = event.index;
			this.scanner = itemScanner(this.listener.itemClosed);

			return;
		}

		const chunk = event.delta.partial_json;
		if (event.index === this.block && chunk !== undefined) {
			this.scanner?.feed(chunk);
		}
	}
}
