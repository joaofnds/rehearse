import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const RECORD_JSON_INDENT_SPACES = 2;

/**
 * Written beside the file and renamed over it, so a reader sees the whole
 * value or none of it.
 */
async function writeWholeJsonFile<Value>(
	file: string,
	value: Readonly<Value>,
): Promise<void> {
	const temporary = `${file}.${randomUUID()}.tmp`;

	await mkdir(dirname(file), { recursive: true });
	await writeFile(
		temporary,
		`${JSON.stringify(value, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
	await rename(temporary, file);
}

export { writeWholeJsonFile as default };
