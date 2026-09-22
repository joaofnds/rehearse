import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { COLOR_TOKENS, RADIUS_TOKENS } from "./token-names";

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
		const listed: string[] = [...COLOR_TOKENS, ...RADIUS_TOKENS];

		for (const token of listed) {
			expect(declared.has(token)).toBe(true);
		}
	});

	it("lists every color and radius token tokens.css declares", async () => {
		const declared = await tokensDeclaredIn(
			join(import.meta.dir, "tokens.css"),
		);
		const listed = new Set<string>([...COLOR_TOKENS, ...RADIUS_TOKENS]);
		const scaled = [...declared].filter(
			(token) => token.startsWith("--color-") || token.startsWith("--radius-"),
		);

		for (const token of scaled) {
			expect(listed.has(token)).toBe(true);
		}
	});
});
