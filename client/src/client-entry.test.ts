import { describe, expect, it } from "bun:test";
import { Glob } from "bun";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const serverModule =
	/^import (?!type )[^;]*? from "#(?<module>(?:benchmark|server)\/[^"]+)";/gmu;
const runtimeImport = /^import (?!type )/mu;

/**
 * Every server module the browser bundle executes, keyed by its import
 * specifier. Tests run under Bun, which serves Node built-ins, so only the
 * bundle loading in a browser would otherwise show one of them failing.
 */
async function serverModulesTheClientRuns(): Promise<
	ReadonlyMap<string, string>
> {
	const clientRoot = `${import.meta.dirname}/`;
	const modules = new Map<string, string>();
	for await (const file of new Glob("**/*.{ts,tsx}").scan(clientRoot)) {
		if (/\.test\.tsx?$/u.test(file) || file.startsWith("test-support/")) {
			continue;
		}
		const source = await readFile(`${clientRoot}${file}`, "utf8");
		for (const { groups } of source.matchAll(serverModule)) {
			const module = groups?.["module"];
			if (module !== undefined) {
				modules.set(
					`#${module}`,
					fileURLToPath(new URL(`../../src/${module}.ts`, import.meta.url)),
				);
			}
		}
	}

	return modules;
}

describe("client entry", () => {
	it("names Rehearse in the browser title", async () => {
		const entryFile = fileURLToPath(new URL("../index.html", import.meta.url));
		const html = await readFile(entryFile, "utf8");
		const document = new DOMParser().parseFromString(html, "text/html");

		expect(document).not.toBeNull();
		expect(document?.title).toBe("Rehearse");
	});

	it("runs only server modules that import nothing at runtime, so the bundle loads in a browser", async () => {
		const importing: string[] = [];
		for (const [specifier, path] of await serverModulesTheClientRuns()) {
			if (runtimeImport.test(await readFile(path, "utf8"))) {
				importing.push(specifier);
			}
		}

		expect(importing).toEqual([]);
	});
});
