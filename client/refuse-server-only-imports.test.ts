import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";

import refuseServerOnlyImports from "./refuse-server-only-imports";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
	roots.length = 0;
});

async function clientWhoseEntryReads(entry: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-client-build-"));
	roots.push(root);
	await writeFile(
		join(root, "index.html"),
		'<script type="module" src="./main.ts"></script>\n',
	);
	await writeFile(join(root, "main.ts"), entry);

	return root;
}

async function builtClient(root: string): ReturnType<typeof build> {
	return await build({
		build: { write: false },
		configFile: false,
		logLevel: "silent",
		plugins: [refuseServerOnlyImports()],
		root,
	});
}

describe(refuseServerOnlyImports.name, () => {
	it("refuses a client that imports a module only the server can run", async () => {
		const root = await clientWhoseEntryReads(
			'import { readFile } from "node:fs/promises";\nconsole.log(readFile);\n',
		);

		expect(builtClient(root)).rejects.toThrow(
			"The client imports node:fs/promises, which runs only on the server",
		);
	});

	it("builds a client that imports none", async () => {
		const root = await clientWhoseEntryReads('console.log("ready");\n');

		expect(await builtClient(root)).toBeDefined();
	});
});
