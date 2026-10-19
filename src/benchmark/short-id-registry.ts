import { join } from "node:path";

import type { z } from "zod";

import { readdirIfPresent, textIfPresent } from "./file-presence";
import parseJsonDocument from "./json-document";
import claimedNumbers from "./numbered-claims";
import { scopedRecordReader } from "./record-read-scope";
import {
	BINDINGS_DIRECTORY,
	CLAIMS_DIRECTORY,
	claimSchema,
	formatShortId,
	registryDirectory,
	shortIdKind,
	stageAttemptSchema,
} from "./short-id-contract";
import type { NamedRecord, ShortId, ShortIdEntry } from "./short-id-contract";

async function readRegistryFile<Parsed>(
	file: string,
	schema: z.ZodType<Parsed>,
): Promise<Parsed | undefined> {
	const text = await textIfPresent(file);
	if (text === undefined) {
		return undefined;
	}

	const documentReading = parseJsonDocument(text, schema);
	if (documentReading.kind === "invalid-json") {
		return undefined;
	}

	return documentReading.parsed.data;
}

async function readEntry(
	directory: string,
	number: number,
): Promise<NamedRecord | undefined> {
	const claim = await readRegistryFile(
		join(directory, CLAIMS_DIRECTORY, String(number)),
		claimSchema,
	);

	return claim?.kind === "replay"
		? await readRegistryFile(
				join(directory, BINDINGS_DIRECTORY, String(number)),
				stageAttemptSchema,
			)
		: claim;
}

interface RegistryEntry {
	readonly number: number;
	readonly record: NamedRecord;
}

const readRegistry = scopedRecordReader(
	async (directory): Promise<readonly RegistryEntry[]> => {
		const names =
			(await readdirIfPresent(join(directory, CLAIMS_DIRECTORY))) ?? [];
		const entries: RegistryEntry[] = [];

		await Array.fromAsync(claimedNumbers(names), async (number) => {
			const record = await readEntry(directory, number);
			if (record !== undefined) {
				entries.push({ number, record });
			}
		});

		return entries;
	},
);

async function readShortIds(
	runsDirectory: string,
	caseId: string,
): Promise<readonly ShortIdEntry[]> {
	const entries = await readRegistry(registryDirectory(runsDirectory, caseId));
	return entries.map(({ number, record }) => ({
		record,
		shortId: formatShortId({ caseId, kind: shortIdKind(record), number }),
	}));
}

/**
 * The record a short id names, or undefined when its number names nothing or
 * was claimed for the other letter: `g4` never names the run claimed as `r4`.
 */
async function resolveShortId(
	runsDirectory: string,
	id: ShortId,
): Promise<NamedRecord | undefined> {
	const record = await readEntry(
		registryDirectory(runsDirectory, id.caseId),
		id.number,
	);

	return record !== undefined && shortIdKind(record) === id.kind
		? record
		: undefined;
}

export { readShortIds, resolveShortId };
