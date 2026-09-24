import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { DatedRecord } from "./short-id-backfill";
import { recordsOnDisk } from "./short-id-backfill";

const REGISTRY_DIRECTORY = "short-ids";
const CLAIMS_DIRECTORY = "claims";
const BINDINGS_DIRECTORY = "bindings";

const runSchema = z.object({ kind: z.literal("run"), run: z.string().min(1) });
const sessionAttemptSchema = z.object({
	kind: z.literal("attempt:session"),
	caseId: z.string().min(1),
	uuid: z.string().min(1),
});
const stageAttemptSchema = z.object({
	kind: z.literal("attempt:stage"),
	lineage: z.string().min(1),
	timestamp: z.string().min(1),
});
const groupSchema = z.object({
	kind: z.literal("group"),
	groupId: z.string().min(1),
});

/**
 * A record a short id names, in the same shape and spelling as its Record ID,
 * so a caller holding one can print or open the record the way `show` does.
 */
const namedRecordSchema = z.discriminatedUnion("kind", [
	runSchema,
	sessionAttemptSchema,
	stageAttemptSchema,
	groupSchema,
]);

export type NamedRecord = z.infer<typeof namedRecordSchema>;

/**
 * A replay's Record ID carries the timestamp it takes only after its session
 * and judge have run, so its claim names the checkpoint it replays and the
 * record is bound to the number by a second write once it is known.
 */
const pendingReplaySchema = z.object({
	kind: z.literal("replay"),
	run: z.string().min(1),
	stage: z.string().min(1),
});

const claimSchema = z.discriminatedUnion("kind", [
	runSchema,
	sessionAttemptSchema,
	stageAttemptSchema,
	groupSchema,
	pendingReplaySchema,
]);

export type ClaimSubject = z.infer<typeof claimSchema>;

export interface ShortId {
	readonly caseId: string;
	readonly kind: "run" | "group";
	readonly number: number;
}

export interface ShortIdEntry {
	readonly shortId: string;
	readonly record: NamedRecord;
}

export function formatShortId(id: ShortId): string {
	const letter = id.kind === "group" ? "g" : "r";

	return `${id.caseId}/${letter}${String(id.number)}`;
}

function registryDirectory(runsDirectory: string, caseId: string): string {
	return join(runsDirectory, REGISTRY_DIRECTORY, caseId);
}

function shortIdKind(subject: ClaimSubject): ShortId["kind"] {
	return subject.kind === "group" ? "group" : "run";
}

async function highestNumber(claimsDirectory: string): Promise<number> {
	let highest = 0;
	for (const name of await readdir(claimsDirectory)) {
		highest = Math.max(highest, Number(name));
	}

	return highest;
}

/**
 * The exclusive create is what makes a number one process's alone: a second
 * writer racing for it gets EEXIST and moves to the next. The content is
 * written after the create, so a writer killed between the two leaves an
 * empty file, which every reader treats as a number that names nothing.
 */
async function createExclusively(
	file: string,
	contents: string,
): Promise<boolean> {
	let handle;
	try {
		handle = await open(file, "wx");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "EEXIST") {
			return false;
		}

		throw error;
	}

	try {
		await handle.writeFile(contents);
	} finally {
		await handle.close();
	}

	return true;
}

function serialize(value: ClaimSubject): string {
	return `${JSON.stringify(value)}\n`;
}

async function writeBackfill(
	directory: string,
	records: readonly DatedRecord[],
): Promise<void> {
	await mkdir(join(directory, CLAIMS_DIRECTORY), { recursive: true });
	await mkdir(join(directory, BINDINGS_DIRECTORY), { recursive: true });

	for (const [index, { record }] of records.entries()) {
		await Bun.write(
			join(directory, CLAIMS_DIRECTORY, String(index + 1)),
			serialize(record),
		);
	}
}

/**
 * A case's registry appears whole or not at all: it is built beside the live
 * one and renamed into place, and a rename onto a registry another process
 * already placed fails rather than replacing it, since a registry always holds
 * its two directories. The loser discards its copy and claims in the winner's,
 * so no new number can be claimed before the case's records are numbered.
 */
async function ensureRegistry(
	runsDirectory: string,
	caseId: string,
): Promise<string> {
	const directory = registryDirectory(runsDirectory, caseId);
	const placed = await stat(join(directory, CLAIMS_DIRECTORY)).then(
		() => true,
		() => false,
	);
	if (placed) {
		return directory;
	}

	const building = join(
		runsDirectory,
		REGISTRY_DIRECTORY,
		`.building-${caseId}-${randomUUID()}`,
	);
	try {
		await writeBackfill(building, await recordsOnDisk(runsDirectory, caseId));
		await rename(building, directory);
	} catch (error) {
		const taken =
			error instanceof Error &&
			"code" in error &&
			(error.code === "ENOTEMPTY" || error.code === "EEXIST");
		if (!taken) {
			throw error;
		}
	} finally {
		await rm(building, { recursive: true, force: true });
	}

	return directory;
}

export async function claimShortId(
	runsDirectory: string,
	caseId: string,
	subject: ClaimSubject,
): Promise<ShortId> {
	const claimsDirectory = join(
		await ensureRegistry(runsDirectory, caseId),
		CLAIMS_DIRECTORY,
	);

	let number = (await highestNumber(claimsDirectory)) + 1;
	while (
		!(await createExclusively(
			join(claimsDirectory, String(number)),
			serialize(subject),
		))
	) {
		number += 1;
	}

	return { caseId, kind: shortIdKind(subject), number };
}

async function readClaim(file: string): Promise<ClaimSubject | undefined> {
	let contents: unknown;
	try {
		contents = JSON.parse(await Bun.file(file).text());
	} catch {
		return undefined;
	}

	return claimSchema.safeParse(contents).data;
}

export async function readShortIds(
	runsDirectory: string,
	caseId: string,
): Promise<readonly ShortIdEntry[]> {
	const directory = registryDirectory(runsDirectory, caseId);
	const names = await readdir(join(directory, CLAIMS_DIRECTORY)).catch(
		(): string[] => [],
	);
	const numbers = names.map(Number).toSorted((left, right) => left - right);
	const entries: ShortIdEntry[] = [];

	for (const number of numbers) {
		const claim = await readClaim(
			join(directory, CLAIMS_DIRECTORY, String(number)),
		);
		if (claim === undefined || claim.kind === "replay") {
			continue;
		}

		entries.push({
			shortId: formatShortId({
				caseId,
				kind: shortIdKind(claim),
				number,
			}),
			record: claim,
		});
	}

	return entries;
}
