import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { RefusedPreconditionError } from "./exit-codes";

const SETTINGS_FILE = "settings.json";

const settingsSchema = z.object({
	spendCeilingUsd: z.number().positive().optional(),
});

export type Settings = z.infer<typeof settingsSchema>;

function settingsFile(recordsDirectory: string): string {
	return join(recordsDirectory, SETTINGS_FILE);
}

export async function readSettings(
	recordsDirectory: string,
): Promise<Settings> {
	let contents: string;
	try {
		contents = await readFile(settingsFile(recordsDirectory), "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return {};
		}

		throw error;
	}

	return settingsSchema.parse(JSON.parse(contents));
}

/**
 * Written beside the file and renamed over it, so a run starting while the
 * operator changes the ceiling reads the old ceiling or the new one, never a
 * torn file.
 */
async function writeSettings(
	recordsDirectory: string,
	settings: Settings,
): Promise<void> {
	const file = settingsFile(recordsDirectory);
	const temporary = `${file}.${randomUUID()}.tmp`;
	await mkdir(recordsDirectory, { recursive: true });
	await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`);
	await rename(temporary, file);
}

export async function storeSpendCeiling(
	recordsDirectory: string,
	ceilingUsd: number,
): Promise<void> {
	if (!Number.isFinite(ceilingUsd) || ceilingUsd <= 0) {
		throw new RangeError(
			`A spend ceiling is a positive number of USD, not ${String(ceilingUsd)}`,
		);
	}

	const settings = await readSettings(recordsDirectory);
	await writeSettings(recordsDirectory, {
		...settings,
		spendCeilingUsd: ceilingUsd,
	});
}

export const SET_SPEND_CEILING_COMMAND =
	"rehearse settings --spend-ceiling-usd <USD>";

/**
 * Every paid command reads the ceiling through here before its first provider
 * call, so a missing ceiling refuses the command rather than letting it spend
 * without one.
 */
export async function requireSpendCeiling(
	recordsDirectory: string,
): Promise<number> {
	const { spendCeilingUsd } = await readSettings(recordsDirectory);
	if (spendCeilingUsd === undefined) {
		throw new RefusedPreconditionError(
			`No spend ceiling is stored, and nothing spends without one. Set it with: ${SET_SPEND_CEILING_COMMAND}`,
		);
	}

	return spendCeilingUsd;
}
