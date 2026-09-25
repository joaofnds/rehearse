import { mkdir, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { isCaseId } from "./case";
import { INITIAL_CHECKPOINT_STAGE } from "./checkpoint";
import { readdirIfPresent, textIfPresent } from "./file-presence";
import { claimedNumbers } from "./numbered-claims";

const REGISTRY_DIRECTORY = "short-ids";
const CLAIMS_DIRECTORY = "claims";
const BINDINGS_DIRECTORY = "bindings";

/**
 * A claim is read back from disk and names the directory a record lives in,
 * so a name that is a path would carry `show` outside the runs directory. The
 * rule is the one a typed Record ID is held to, and a claim breaking it names
 * nothing.
 */
const segmentSchema = z
	.string()
	.min(1)
	.refine((text) => text !== "." && text !== ".." && !text.includes("/"));

const runSchema = z.object({ kind: z.literal("run"), run: segmentSchema });
const sessionAttemptSchema = z.object({
	kind: z.literal("attempt:session"),
	caseId: segmentSchema,
	uuid: segmentSchema,
});
const stageAttemptSchema = z.object({
	kind: z.literal("attempt:stage"),
	lineage: segmentSchema,
	timestamp: segmentSchema,
});
/**
 * A replay confirmation's group names the checkpoint its reps replayed, since
 * its own record carries only a lineage and two runs can share one.
 */
const groupSchema = z.object({
	kind: z.literal("group"),
	groupId: segmentSchema,
	source: z.object({ run: segmentSchema, stage: segmentSchema }).optional(),
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
	run: segmentSchema,
	stage: segmentSchema,
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
	return claimedNumbers(await readdir(claimsDirectory)).at(-1) ?? 0;
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

async function ensureRegistry(
	runsDirectory: string,
	caseId: string,
): Promise<string> {
	const directory = registryDirectory(runsDirectory, caseId);

	await mkdir(join(directory, CLAIMS_DIRECTORY), { recursive: true });
	await mkdir(join(directory, BINDINGS_DIRECTORY), { recursive: true });

	return directory;
}

/**
 * The case id names the registry's directory, and a replay reads it from a
 * manifest on disk, so one that is not a case id is refused before it can
 * name a directory outside the registry.
 */
export async function claimShortId(
	runsDirectory: string,
	caseId: string,
	subject: ClaimSubject,
): Promise<ShortId> {
	if (!isCaseId(caseId)) {
		throw new Error(
			`Cannot claim a short id in ${caseId}: it is not a case id`,
		);
	}
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

async function readRegistryFile<Parsed>(
	file: string,
	schema: z.ZodType<Parsed>,
): Promise<Parsed | undefined> {
	const text = await textIfPresent(file);
	if (text === undefined) {
		return undefined;
	}
	let contents: unknown;
	try {
		contents = JSON.parse(text);
	} catch {
		return undefined;
	}

	return schema.safeParse(contents).data;
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
		? readRegistryFile(
				join(directory, BINDINGS_DIRECTORY, String(number)),
				stageAttemptSchema,
			)
		: claim;
}

export async function readShortIds(
	runsDirectory: string,
	caseId: string,
): Promise<readonly ShortIdEntry[]> {
	const directory = registryDirectory(runsDirectory, caseId);
	const names =
		(await readdirIfPresent(join(directory, CLAIMS_DIRECTORY))) ?? [];
	const entries: ShortIdEntry[] = [];

	for (const number of claimedNumbers(names)) {
		const record = await readEntry(directory, number);
		if (record === undefined) {
			continue;
		}

		entries.push({
			shortId: formatShortId({ caseId, kind: shortIdKind(record), number }),
			record,
		});
	}

	return entries;
}

/**
 * Every short id claimed in any case, for a listing that prints them beside
 * Record IDs. It reads registries and builds none, so listing stays read-only
 * and a case no command has claimed in prints no short ids.
 */
export async function readAllShortIds(
	runsDirectory: string,
): Promise<readonly ShortIdEntry[]> {
	const cases =
		(await readdirIfPresent(join(runsDirectory, REGISTRY_DIRECTORY))) ?? [];
	const entries: ShortIdEntry[] = [];
	for (const caseId of cases.filter((name) => isCaseId(name))) {
		entries.push(...(await readShortIds(runsDirectory, caseId)));
	}

	return entries;
}

/**
 * The record a short id names, or undefined when its number names nothing or
 * was claimed for the other letter: `g4` never names the run claimed as `r4`.
 */
export async function resolveShortId(
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

/**
 * A checkpoint's label is its place in the run: 0 for the one taken after
 * task setup, then each stage by its position in the pipeline the run froze
 * into its manifest, so the label is fixed when the run starts.
 */
export function checkpointStageNumber(
	stages: readonly string[],
	stage: string,
): number | undefined {
	if (stage === INITIAL_CHECKPOINT_STAGE) {
		return 0;
	}
	const index = stages.indexOf(stage);

	return index === -1 ? undefined : index + 1;
}

export function formatCheckpointShortId(
	runShortId: string,
	stage: number,
): string {
	return `${runShortId}/s${String(stage)}`;
}

export function checkpointStageAt(
	stages: readonly string[],
	number: number,
): string | undefined {
	return number === 0 ? INITIAL_CHECKPOINT_STAGE : stages[number - 1];
}

export async function bindReplay(
	runsDirectory: string,
	id: ShortId,
	attempt: { readonly lineage: string; readonly timestamp: string },
): Promise<void> {
	const binding = join(
		registryDirectory(runsDirectory, id.caseId),
		BINDINGS_DIRECTORY,
		String(id.number),
	);

	const bound = await createExclusively(
		binding,
		serialize({ kind: "attempt:stage", ...attempt }),
	);
	if (!bound) {
		throw new Error(
			`Short id ${formatShortId(id)} is already bound to a replay record`,
		);
	}
}
