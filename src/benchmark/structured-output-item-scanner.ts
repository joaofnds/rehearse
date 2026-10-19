import { z } from "zod";

const OUTER_OBJECT_DEPTH = 1;
const EXCLUSIVE_JSON_SLICE_END_OFFSET = 1;
const JSON_NESTING_LEVEL_STEP = 1;
const SCANNED_CHARACTER_STEP = 1;
/** Depth 1 is inside the output object, depth 2 inside a section's array. */
const SECTION_DEPTH = 2;
interface ClosedItem {
	/** The top-level key whose array holds the item. */
	readonly section: string;
	readonly item: unknown;
}
const INITIAL_SCAN_POSITION = 0;
const INITIAL_JSON_DEPTH = 0;
class StructuredItemScanner {
	private text = "";
	private scanned = INITIAL_SCAN_POSITION;
	private depth = INITIAL_JSON_DEPTH;
	private inString = false;
	private escaped = false;
	private stringStart = INITIAL_SCAN_POSITION;
	private lastKey = "";
	private section: string | undefined = undefined;
	private itemStart = INITIAL_SCAN_POSITION;
	public constructor(private readonly itemClosed: (item: ClosedItem) => void) {}
	public feed(chunk: string): void {
		this.text += chunk;
		// A listener that throws leaves the scan past its character, so the
		// next chunk carries on from a consistent nesting depth.
		while (this.scanned < this.text.length) {
			const position = this.scanned;
			this.scanned += SCANNED_CHARACTER_STEP;
			this.scan(this.text.charAt(position), position);
		}
	}
	private scanString(character: string, position: number): void {
		if (this.escaped) {
			this.escaped = false;
		} else if (character === "\\") {
			this.escaped = true;
		} else if (character === '"') {
			this.inString = false;
			if (this.depth === OUTER_OBJECT_DEPTH) {
				this.lastKey = z
					.string()
					.parse(
						JSON.parse(
							this.text.slice(
								this.stringStart,
								position + EXCLUSIVE_JSON_SLICE_END_OFFSET,
							),
						),
					);
			}
		}
	}
	private scan(character: string, position: number): void {
		if (this.inString) {
			this.scanString(character, position);
			return;
		}

		if (character === '"') {
			this.inString = true;
			this.stringStart = position;

			return;
		}

		this.scanNesting(character, position);
	}
	private scanNesting(character: string, position: number): void {
		switch (character) {
			case "[": {
				this.openArray();
				break;
			}
			case "{": {
				this.openObject(position);
				break;
			}
			case "}": {
				this.closeObject(position);
				break;
			}
			case "]": {
				this.closeArray();
				break;
			}
			default: {
				break;
			}
		}
	}
	private openArray(): void {
		if (this.depth === OUTER_OBJECT_DEPTH) {
			this.section = this.lastKey;
		}
		this.depth += JSON_NESTING_LEVEL_STEP;
	}
	private openObject(position: number): void {
		if (this.depth === SECTION_DEPTH && this.section !== undefined) {
			this.itemStart = position;
		}
		this.depth += JSON_NESTING_LEVEL_STEP;
	}
	private closeObject(position: number): void {
		this.depth -= JSON_NESTING_LEVEL_STEP;
		if (this.depth === SECTION_DEPTH && this.section !== undefined) {
			const { itemClosed } = this;
			itemClosed({
				item: JSON.parse(
					this.text.slice(
						this.itemStart,
						position + EXCLUSIVE_JSON_SLICE_END_OFFSET,
					),
				),
				section: this.section,
			});
		}
	}
	private closeArray(): void {
		this.depth -= JSON_NESTING_LEVEL_STEP;
		if (this.depth === OUTER_OBJECT_DEPTH) {
			this.section = undefined;
		}
	}
}
export { StructuredItemScanner as default };
export type { ClosedItem };
