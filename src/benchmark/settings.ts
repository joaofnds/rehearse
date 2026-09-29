import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { RefusedPreconditionError } from "./exit-codes";
import { textIfPresent } from "./file-presence";

const SETTINGS_FILE = "settings.json";

export const SET_SPEND_CEILING_COMMAND =
	"rehearse settings --spend-ceiling-usd <USD>";

export const LINK_CORPUS_COMMAND =
	"rehearse settings --link-corpus <directory>";

export const UNLINK_CORPUS_COMMAND = "rehearse settings --unlink-corpus";

/** Loose, so storing a ceiling keeps settings a later version wrote. */
const settingsSchema = z.looseObject({
	spendCeilingUsd: z.number().positive().optional(),
	linkedCorpusDirectory: z.string().refine(isAbsolute).optional(),
});

export type Settings = z.infer<typeof settingsSchema>;

function settingsFile(recordsDirectory: string): string {
	return join(recordsDirectory, SETTINGS_FILE);
}

export async function readSettings(
	recordsDirectory: string,
): Promise<Settings> {
	const file = settingsFile(recordsDirectory);
	const contents = await textIfPresent(file);
	if (contents === undefined) {
		return {};
	}

	const settings = parsedSettings(contents);
	if (settings === undefined) {
		throw new RefusedPreconditionError(
			`The settings file ${file} is not valid settings, so neither the spend ceiling nor the linked corpus can be read from it. Correct or delete it, then set the ceiling with: ${SET_SPEND_CEILING_COMMAND}`,
		);
	}

	return settings;
}

function parsedSettings(contents: string): Settings | undefined {
	try {
		return settingsSchema.safeParse(JSON.parse(contents)).data;
	} catch {
		return undefined;
	}
}

/**
 * Written beside the file and renamed over it, so a run starting while the
 * operator changes the ceiling reads the old ceiling or the new one, never a
 * torn file.
 */
async function writeSettings(
	recordsDirectory: string,
	settings: Readonly<Settings>,
): Promise<void> {
	const file = settingsFile(recordsDirectory);
	const temporary = `${file}.${randomUUID()}.tmp`;
	await mkdir(recordsDirectory, { recursive: true });
	await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`);
	await rename(temporary, file);
}

let pendingChange: Promise<undefined> = Promise.resolve(undefined);

/**
 * Each change reads settings after the one before it has written, so two
 * changes in this process never drop each other's field. Another process
 * writing at the same moment can still.
 */
async function changeSettings(
	recordsDirectory: string,
	change: (settings: Readonly<Settings>) => Settings,
): Promise<void> {
	const previous = pendingChange;
	const { promise: done, resolve: finish } = Promise.withResolvers<undefined>();
	pendingChange = done;
	try {
		await previous;
		const settings = await readSettings(recordsDirectory);
		await writeSettings(recordsDirectory, change(settings));
	} finally {
		finish(undefined);
	}
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

	await changeSettings(recordsDirectory, (settings) => ({
		...settings,
		spendCeilingUsd: ceilingUsd,
	}));
}

/** Undefined removes the link, which leaves the live install linked. */
export async function storeLinkedCorpusDirectory(
	recordsDirectory: string,
	root: string | undefined,
): Promise<void> {
	await changeSettings(recordsDirectory, (settings) => ({
		...settings,
		linkedCorpusDirectory: root,
	}));
}

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
