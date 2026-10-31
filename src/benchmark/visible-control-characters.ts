const HEX_RADIX = 16;
const ESCAPE_HEX_DIGITS = 4;
const FIRST_CODE_UNIT_INDEX = 0;
const NUL_CODE_POINT = 0;

const CONTROL_CHARACTER = /[\p{Cc}\p{Bidi_Control}]/gu;

function unicodeEscape(character: string): string {
	const codePoint =
		character.codePointAt(FIRST_CODE_UNIT_INDEX) ?? NUL_CODE_POINT;

	return `\\u${codePoint.toString(HEX_RADIX).padStart(ESCAPE_HEX_DIGITS, "0")}`;
}

/**
 * Model-chosen text bound for a terminal, with every control character and
 * bidi control written as visible `\uXXXX` text, so the model cannot move the
 * cursor, recolor the output or reorder what the operator reads. Any message
 * that carries model text to stderr goes through this.
 */
function visibleControlCharacters(text: string): string {
	return text.replaceAll(CONTROL_CHARACTER, unicodeEscape);
}

export { visibleControlCharacters as default };
