import { rename, symlink } from "node:fs/promises";
import { basename, join } from "node:path";

import { readCaseDeclaration } from "#benchmark/case";
import type { Serving } from "#server/task-bundle-tests/bundle-server-fixture";

interface LinkedInput {
	readonly server: Serving;
	readonly path: string;
	readonly internal: boolean;
}

async function prepareInput(server: Serving, path: string): Promise<void> {
	if (path === "rubrics/extra.json") {
		await Bun.write(
			join(server.cases, "pipe-case", path),
			Bun.file(join(server.cases, "pipe-case", "rubrics", "shape.json")),
		);
		return;
	}

	if (path !== "settings.json") {
		return;
	}

	const declaration = await readCaseDeclaration("pipe-case", server.cases);
	await Bun.write(join(server.cases, "pipe-case", path), "{}");
	await Bun.write(
		join(server.cases, "pipe-case", "case.json"),
		JSON.stringify({ ...declaration, settingsFile: path }),
	);
}

/** Moves a real fixture entry and leaves a link at its declared path. */
async function linkBundleInput({
	server,
	path,
	internal,
}: LinkedInput): Promise<void> {
	await prepareInput(server, path);
	const directory = await server.directory(
		internal ? "cases/pipe-case/linked-inputs" : "outside",
	);
	const source = join(server.cases, "pipe-case", path);
	const destination = join(directory, basename(path));
	await rename(source, destination);
	await symlink(destination, source);
}

export { linkBundleInput as default };
