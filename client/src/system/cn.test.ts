import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { RADIUS_STEPS, TRACKING_STEPS, TYPE_STEPS } from "./cn";

/** Steps Tailwind's own scales name, which the merge already knows. */
const TAILWIND_SIZES = new Set(["xs", "sm", "md", "lg", "xl"]);

async function stepsDeclaredIn(
	cssPath: string,
	namespace: string,
): Promise<string[]> {
	const css = await Bun.file(cssPath).text();
	const matches = css.matchAll(
		new RegExp(`--${namespace}-(?<step>[a-z0-9-]+):`, "gu"),
	);

	return [...matches]
		.map((match) => match.groups?.["step"])
		.filter((step) => step !== undefined)
		.filter((step) => !TAILWIND_SIZES.has(step));
}

describe("cn", () => {
	it.each([
		["text", TYPE_STEPS],
		["radius", RADIUS_STEPS],
		["tracking", TRACKING_STEPS],
	] as const)(
		"knows every %s step theme.css declares",
		async (namespace, known) => {
			const declared = await stepsDeclaredIn(
				join(import.meta.dir, "theme.css"),
				namespace,
			);

			expect(new Set(declared)).toEqual(new Set(known));
		},
	);
});
