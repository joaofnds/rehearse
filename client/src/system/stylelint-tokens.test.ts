import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { LinterResult } from "stylelint";
import stylelint from "stylelint";

const FIRST_STYLELINT_RESULT_INDEX = 0;

async function lintCss(code: string, filename: string): Promise<LinterResult> {
	return await stylelint.lint({
		code,
		codeFilename: join(import.meta.dir, filename),
		configFile: join(import.meta.dir, "../../../.stylelintrc.json"),
	});
}

describe("stylelint token declarations", () => {
	it(
		"reports a raw hex color in a component color token",
		reportsARawHexColorInAComponentColorToken,
	);

	it.each(["component.css", "theme.css", "../other/tokens.css"])(
		"rejects a palette declaration outside the canonical palette in %s",
		refusesPaletteOutsideCanonicalFile,
	);

	it.each([
		"a { --color-example: #ff0000; }",
		"@media screen { :root { --color-example: #ff0000; } }",
	])(
		"rejects a palette declaration outside the palette root: %s",
		refusesPaletteOutsideRoot,
	);

	it.each(["component.css", "tokens.css"])(
		"reports a bare hex color in an ordinary declaration in %s",
		refusesBareHexInOrdinaryDeclaration,
	);

	it.each(["component.css", "tokens.css"])(
		"reports bare px padding in %s",
		refusesBarePaddingPixels,
	);

	it(
		"allows palette and size declarations by their semantic role",
		allowsPaletteAndSizeDeclarationsByTheirSemanticRole,
	);

	it(
		"rejects a raw color disguised as a spacing token",
		rejectsARawColorDisguisedAsASpacingToken,
	);

	it(
		"passes the maintained token definitions",
		passesTheMaintainedTokenDefinitions,
	);
});

async function reportsARawHexColorInAComponentColorToken(): Promise<void> {
	const result = await lintCss(
		"a { --color-unreviewed: #ff0000; background: var(--color-unreviewed); }",
		"../example.css",
	);

	expect(
		result.results[FIRST_STYLELINT_RESULT_INDEX]?.warnings.map(
			({ rule }) => rule,
		),
	).toEqual(["rehearse/color-token-palette"]);
}

async function allowsPaletteAndSizeDeclarationsByTheirSemanticRole(): Promise<void> {
	const result = await lintCss(
		":root { --color-example: #ff0000; --font-size-example: 13px; }",
		"tokens.css",
	);

	const [observedFirstResult] = result.results;

	expect(observedFirstResult?.warnings).toEqual([]);
}

async function rejectsARawColorDisguisedAsASpacingToken(): Promise<void> {
	const result = await lintCss(
		":root { --spacing-example: #ff0000; }",
		"tokens.css",
	);

	expect(
		result.results[FIRST_STYLELINT_RESULT_INDEX]?.warnings.map(
			({ rule }) => rule,
		),
	).toEqual(["rehearse/color-token-palette"]);
}

async function passesTheMaintainedTokenDefinitions(): Promise<void> {
	const result = await stylelint.lint({
		configFile: join(import.meta.dir, "../../../.stylelintrc.json"),
		files: join(import.meta.dir, "tokens.css"),
	});

	const [observedFirstResult] = result.results;

	expect(observedFirstResult?.warnings).toEqual([]);
}

async function refusesPaletteOutsideCanonicalFile(
	filename: string,
): Promise<void> {
	const result = await lintCss(":root { --color-example: #ff0000; }", filename);

	expect(
		result.results[FIRST_STYLELINT_RESULT_INDEX]?.warnings.map(
			({ rule }) => rule,
		),
	).toEqual(["rehearse/color-token-palette"]);
}

async function refusesPaletteOutsideRoot(code: string): Promise<void> {
	const result = await lintCss(code, "tokens.css");

	expect(
		result.results[FIRST_STYLELINT_RESULT_INDEX]?.warnings.map(
			({ rule }) => rule,
		),
	).toEqual(["rehearse/color-token-palette"]);
}

async function refusesBareHexInOrdinaryDeclaration(
	filename: string,
): Promise<void> {
	const result = await lintCss("a { color: #ff0000; }", filename);

	expect(
		result.results[FIRST_STYLELINT_RESULT_INDEX]?.warnings.map(
			({ rule }) => rule,
		),
	).toEqual(["rehearse/color-token-palette"]);
}

async function refusesBarePaddingPixels(filename: string): Promise<void> {
	const result = await lintCss("a { padding: 4px; }", filename);

	expect(
		result.results[FIRST_STYLELINT_RESULT_INDEX]?.warnings.map(
			({ rule }) => rule,
		),
	).toEqual(["declaration-property-unit-disallowed-list"]);
}
