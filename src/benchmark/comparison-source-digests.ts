import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

async function directoryDigests(
	directory: string,
): Promise<Readonly<Record<string, string>>> {
	const digests: Record<string, string> = {};
	const entries = await readdir(directory, { recursive: true });

	await Array.fromAsync(entries.toSorted(), async (entry) => {
		const path = join(directory, entry);
		const file = Bun.file(path);
		if (!(await file.exists()) || file.type === "directory") {
			return;
		}

		digests[entry] = createHash("sha256")
			.update(await file.bytes())
			.digest("hex");
	});

	return digests;
}

export { directoryDigests as default };
