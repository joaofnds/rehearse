import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
	COLOR_TOKENS,
	FONT_SIZE_TOKENS,
	LETTER_SPACING_TOKENS,
	RADIUS_TOKENS,
	SPACE_TOKENS,
} from "./token-names";

async function spacingAliasesIn(cssPath: string): Promise<Map<string, string>> {
	const css = await Bun.file(cssPath).text();
	const matches = css.matchAll(
		/(?<alias>--spacing-[a-z0-9-]+):\s*var\((?<token>--space-[0-9]+)\)/gu,
	);

	return new Map(
		[...matches].map((match) => [
			match.groups?.["alias"] ?? "",
			match.groups?.["token"] ?? "",
		]),
	);
}

async function tokensDeclaredIn(cssPath: string): Promise<Set<string>> {
	const css = await Bun.file(cssPath).text();
	const matches = css.matchAll(/(?<name>--[a-z0-9-]+):/gu);
	const names = [...matches].map((match) => match.groups?.["name"]);

	return new Set(names.filter((name) => name !== undefined));
}

describe("token-names", () => {
	it("lists no custom property that tokens.css does not declare", async () => {
		const declared = await tokensDeclaredIn(
			join(import.meta.dir, "tokens.css"),
		);
		const listed: string[] = [
			...COLOR_TOKENS,
			...FONT_SIZE_TOKENS,
			...SPACE_TOKENS,
			...RADIUS_TOKENS,
			...LETTER_SPACING_TOKENS,
		];

		for (const token of listed) {
			expect(declared.has(token)).toBe(true);
		}
	});

	it("lists every color, font-size, space, radius, and letter-spacing token tokens.css declares", async () => {
		const declared = await tokensDeclaredIn(
			join(import.meta.dir, "tokens.css"),
		);
		const listed = new Set<string>([
			...COLOR_TOKENS,
			...FONT_SIZE_TOKENS,
			...SPACE_TOKENS,
			...RADIUS_TOKENS,
			...LETTER_SPACING_TOKENS,
		]);
		const scaled = [...declared].filter(
			(token) =>
				token.startsWith("--color-") ||
				(token.startsWith("--font-size-") && token !== "--font-size-base") ||
				token.startsWith("--space-") ||
				token.startsWith("--radius-") ||
				token.startsWith("--letter-spacing-"),
		);

		for (const token of scaled) {
			expect(listed.has(token)).toBe(true);
		}
	});
});

describe("spacing aliases", () => {
	it("points each --spacing-Npx at the --space-N of the same pixel value", async () => {
		const aliases = await spacingAliasesIn(join(import.meta.dir, "theme.css"));

		expect(aliases.size).toBeGreaterThan(0);
		for (const [alias, token] of aliases) {
			expect(token).toBe(
				alias.replace("--spacing-", "--space-").replace("px", ""),
			);
		}
	});

	it("aliases only a space token tokens.css declares", async () => {
		const declared = await tokensDeclaredIn(
			join(import.meta.dir, "tokens.css"),
		);
		const aliases = await spacingAliasesIn(join(import.meta.dir, "theme.css"));

		for (const token of aliases.values()) {
			expect(declared.has(token)).toBe(true);
		}
	});
});
