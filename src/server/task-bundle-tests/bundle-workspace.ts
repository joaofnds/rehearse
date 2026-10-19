import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";

class BundleWorkspace implements AsyncDisposable {
	readonly #root: string;
	public constructor(root: string) {
		this.#root = root;
	}
	public async directory(name: string): Promise<string> {
		const directory = join(this.#root, name);
		await mkdir(directory, { recursive: true });

		return directory;
	}
	public async repository(): Promise<string> {
		const directory = await this.directory("target");
		await runCommand(["git", "init", "-b", "main"], directory);

		return directory;
	}
	public async inspect(): Promise<readonly FixtureEntry[]> {
		return await fixtureTree(this.#root);
	}
	public async [Symbol.asyncDispose](): Promise<void> {
		await rm(this.#root, { force: true, recursive: true });
	}
}

async function bundleWorkspace(): Promise<BundleWorkspace> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-bundle-"));
	return new BundleWorkspace(root);
}

interface FixtureEntry {
	readonly path: string;
	readonly kind: "directory" | "file";
	readonly mtimeMs: number;
	readonly mode: number;
	readonly size: number;
	readonly digest: string | undefined;
}

async function fileDigest(path: string): Promise<string> {
	const bytes = await readFile(path);
	return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

async function fixtureTree(root: string): Promise<readonly FixtureEntry[]> {
	const paths = await readdir(root, { recursive: true });
	return await Array.fromAsync(
		paths.toSorted(),
		async (path): Promise<FixtureEntry> => {
			const fullPath = join(root, path);
			const entry = await lstat(fullPath);

			return {
				digest: entry.isFile() ? await fileDigest(fullPath) : undefined,
				kind: entry.isDirectory() ? "directory" : "file",
				mode: entry.mode,
				mtimeMs: entry.mtimeMs,
				path,
				size: entry.size,
			};
		},
	);
}

async function directoryErrno(path: string): Promise<"ENOENT" | undefined> {
	try {
		await stat(path);

		return undefined;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return error.code;
		}

		throw error;
	}
}

export { bundleWorkspace, directoryErrno };
export type { FixtureEntry };
