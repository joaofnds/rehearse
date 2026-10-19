import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Glob } from "bun";

const serverModule =
	/^(?:import|export) (?!type )[^;]*? from "#(?<module>(?:benchmark|cli|server)\/[^"]+)";/gmu;
const runtimeImport = /^(?:import (?!type )|export (?!type )[^;]*? from )/mu;
const zodSchemaImport = /^import (?!type )[^;]*? from "zod";/gmu;

/** Zod is a browser dependency; shared schema leaves may use it without server imports. */
function hasOtherRuntimeImport(source: string): boolean {
	return runtimeImport.test(source.replace(zodSchemaImport, ""));
}

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
		if (!/\.test\.tsx?$/u.test(file) && !file.startsWith("test-support/")) {
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
	}

	return modules;
}

describe("client entry", () => {
	it("names Rehearse in the browser title", namesRehearseInTheBrowserTitle);

	it(
		"allows explicit Zod schema imports while detecting Node and transitive server imports",
		allowsExplicitZodSchemaImportsWhileDetectingNodeAndTransitiveServerImports,
	);

	it(
		"runs shared modules with only browser-safe Zod imports, refusing server dependencies",
		runsSharedModulesWithOnlyBrowserSafeZodImportsRefusingServerDependencies,
	);
});

async function namesRehearseInTheBrowserTitle(): Promise<void> {
	const entryFile = fileURLToPath(new URL("../index.html", import.meta.url));
	const html = await readFile(entryFile, "utf8");
	const document = new DOMParser().parseFromString(html, "text/html");

	expect(document).not.toBeNull();
	expect(document?.title).toBe("Rehearse");
}

function allowsExplicitZodSchemaImportsWhileDetectingNodeAndTransitiveServerImports(): void {
	expect(
		hasOtherRuntimeImport(
			'import { z } from "zod";\nexport const schema = z.string();',
		),
	).toBe(false);
	expect(
		hasOtherRuntimeImport(
			'import type { Grade } from "./contracts";\nimport { z } from "zod";',
		),
	).toBe(false);
	expect(
		hasOtherRuntimeImport(
			'import { z } from "zod";\nimport { readFile } from "node:fs/promises";',
		),
	).toBe(true);
	expect(
		hasOtherRuntimeImport(
			'import { z } from "zod";\nexport { readRecord } from "./records";',
		),
	).toBe(true);
	expect(
		hasOtherRuntimeImport(
			'import { z } from "zod";\nimport { CONTROL_DIR } from "./config";',
		),
	).toBe(true);
}

async function runsSharedModulesWithOnlyBrowserSafeZodImportsRefusingServerDependencies(): Promise<void> {
	const importing: string[] = [];
	await Array.fromAsync(
		await serverModulesTheClientRuns(),
		async ([specifier, path]) => {
			if (hasOtherRuntimeImport(await readFile(path, "utf8"))) {
				importing.push(specifier);
			}
		},
	);

	expect(importing).toEqual([]);
}
