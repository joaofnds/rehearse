import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { resolveCorpusSource } from "#benchmark/corpus-source";
import { TestResources } from "#benchmark/test-support";

import type { LiveCorpusRoot } from "./corpus-file";
import type { HomePathCitationMap } from "./home-path-citation";

const resources = new TestResources();

/** A map that redirects nothing, for installs whose text cites no home path. */
const noCitations: HomePathCitationMap = { home: "/no-home", roots: [] };

async function directoryCorpus(
	files: Readonly<Record<string, string>>,
): Promise<string> {
	const root = await resources.createControlDirectory();
	await Array.fromAsync(
		Object.entries(files),
		async ([layoutPath, contents]) => {
			await Bun.write(join(root, layoutPath), contents);
		},
	);

	return root;
}

function sha256Of(contents: string): string {
	return new Bun.CryptoHasher("sha256").update(contents).digest("hex");
}

interface TwoStyleCorpus {
	readonly source: Awaited<ReturnType<typeof resolveCorpusSource>>;
	readonly destination: string;
}
async function twoStyleCorpus(): Promise<TwoStyleCorpus> {
	const root = await directoryCorpus({
		"agents/rogue.md": "an undeclared agent\n",
		"output-styles/aardvark.md": "an undeclared style\n",
		"output-styles/brief.md": "the declared style\n",
	});
	const destination = await resources.createControlDirectory();

	return {
		destination: join(destination, "corpus"),
		source: await resolveCorpusSource(root),
	};
}

interface NestedForeignCorpus {
	readonly source: LiveCorpusRoot;
	readonly destination: string;
}
async function nestedForeignCorpus(): Promise<NestedForeignCorpus> {
	const liveRoot = await resources.createControlDirectory();
	const backingRoot = await resources.createControlDirectory();
	const outside = await resources.createControlDirectory();
	await Bun.write(join(outside, "secret.md"), "FOREIGN SECRET\n");
	await mkdir(join(backingRoot, "carrier", "nested"), { recursive: true });
	await symlink(
		join(outside, "secret.md"),
		join(backingRoot, "carrier", "nested", "leak.md"),
	);
	await mkdir(join(liveRoot, "output-styles"), { recursive: true });
	await symlink(
		join(backingRoot, "carrier"),
		join(liveRoot, "output-styles", "declared"),
	);
	const destination = join(await resources.createControlDirectory(), "corpus");

	return { destination, source: { backingRoot, kind: "live", root: liveRoot } };
}

export {
	resources,
	noCitations,
	directoryCorpus,
	sha256Of,
	twoStyleCorpus,
	nestedForeignCorpus,
};
