import { describe, expect, it } from "bun:test";

import {
	visibleControlCharacters,
	visibleControlCharactersInJson,
} from "./visible-control-characters";

const HEX_RADIX = 16;
const NEXT_CODE_POINT = 1;
const ESCAPE_HEX_DIGITS = 4;

const C0_FIRST = 0;
const C0_LAST = 31;
const DEL = 127;
const C1_LAST = 159;
const ARABIC_LETTER_MARK = 1564;
const LEFT_TO_RIGHT_MARK = 8206;
const RIGHT_TO_LEFT_MARK = 8207;
const LEFT_TO_RIGHT_EMBEDDING = 8234;
const RIGHT_TO_LEFT_OVERRIDE = 8238;
const LEFT_TO_RIGHT_ISOLATE = 8294;
const POP_DIRECTIONAL_ISOLATE = 8297;

function codePoints(first: number, last: number): readonly number[] {
	const all: number[] = [];
	for (let codePoint = first; codePoint <= last; codePoint += NEXT_CODE_POINT) {
		all.push(codePoint);
	}

	return all;
}

const BIDI_CONTROLS = [
	ARABIC_LETTER_MARK,
	LEFT_TO_RIGHT_MARK,
	RIGHT_TO_LEFT_MARK,
	...codePoints(LEFT_TO_RIGHT_EMBEDDING, RIGHT_TO_LEFT_OVERRIDE),
	...codePoints(LEFT_TO_RIGHT_ISOLATE, POP_DIRECTIONAL_ISOLATE),
];

const RAW_IN_JSON = [...codePoints(DEL, C1_LAST), ...BIDI_CONTROLS];

const TERMINAL_CONTROLS = [...codePoints(C0_FIRST, C0_LAST), ...RAW_IN_JSON];

function escapeOf(codePoint: number): string {
	return `\\u${codePoint.toString(HEX_RADIX).padStart(ESCAPE_HEX_DIGITS, "0")}`;
}

describe(visibleControlCharacters.name, () => {
	it.each(TERMINAL_CONTROLS)(
		"writes code point %i as its escape",
		(codePoint) => {
			expect(
				visibleControlCharacters(`a${String.fromCodePoint(codePoint)}b`),
			).toBe(`a${escapeOf(codePoint)}b`);
		},
	);
	it("leaves other text as it is", () => {
		expect(visibleControlCharacters(String.raw`stage \u001b é`)).toBe(
			String.raw`stage \u001b é`,
		);
	});
});

describe(visibleControlCharactersInJson.name, () => {
	it.each(RAW_IN_JSON)(
		"writes code point %i as an escape the JSON parses back",
		(codePoint) => {
			const value = { reason: `a${String.fromCodePoint(codePoint)}b` };

			const json = visibleControlCharactersInJson(
				JSON.stringify(value, null, "\t"),
			);

			expect(json).toContain(`"a${escapeOf(codePoint)}b"`);
			expect(JSON.parse(json)).toEqual(value);
		},
	);
	it("keeps the line feeds that indent the JSON", () => {
		const json = JSON.stringify({ reason: "a" }, null, "\t");

		expect(visibleControlCharactersInJson(json)).toBe(json);
	});
});
