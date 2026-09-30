import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { cn } from "./cn";

/** Steps Tailwind's own scales name, which the merge already knows. */
const TAILWIND_SIZES = new Set(["xs", "sm", "md", "lg", "xl"]);

const THEME = await Bun.file(join(import.meta.dir, "theme.css")).text();

function stepsDeclared(namespace: string): string[] {
	const matches = THEME.matchAll(
		new RegExp(`--${namespace}-(?<step>[a-z0-9-]+):`, "gu"),
	);

	return [...matches]
		.map((match) => match.groups?.["step"])
		.filter((step) => step !== undefined)
		.filter((step) => !TAILWIND_SIZES.has(step));
}

describe("cn", () => {
	it.each([
		...stepsDeclared("text").map((step) => ["text-base", `text-${step}`]),
		...stepsDeclared("radius").map((step) => ["rounded-md", `rounded-${step}`]),
		...stepsDeclared("tracking").map((step) => [
			"tracking-widest",
			`tracking-${step}`,
		]),
	])("lets theme.css's %s give way to %s", (earlier, step) => {
		expect(cn(earlier, step)).toBe(step);
	});

	it.each(stepsDeclared("text"))(
		"keeps a text colour beside the text-%s type step",
		(step) => {
			expect(cn("text-dim", `text-${step}`)).toBe(`text-dim text-${step}`);
		},
	);
});
