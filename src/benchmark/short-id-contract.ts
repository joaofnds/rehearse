import { join } from "node:path";

import { z } from "zod";

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
	.nonempty()
	.refine((text) => text !== "." && text !== ".." && !text.includes("/"));

const runSchema = z.object({ kind: z.literal("run"), run: segmentSchema });

const sessionAttemptSchema = z.object({
	caseId: segmentSchema,
	kind: z.literal("attempt:session"),
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
	groupId: segmentSchema,
	kind: z.literal("group"),
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

type NamedRecord = z.infer<typeof namedRecordSchema>;

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

type ClaimSubject = z.infer<typeof claimSchema>;

interface ShortId {
	readonly caseId: string;
	readonly kind: "run" | "group";
	readonly number: number;
}

interface ShortIdEntry {
	readonly shortId: string;
	readonly record: NamedRecord;
}

function formatShortId(id: ShortId): string {
	const letter = id.kind === "group" ? "g" : "r";

	return `${id.caseId}/${letter}${String(id.number)}`;
}

function registryDirectory(runsDirectory: string, caseId: string): string {
	return join(runsDirectory, REGISTRY_DIRECTORY, caseId);
}

function shortIdKind(subject: ClaimSubject): ShortId["kind"] {
	return subject.kind === "group" ? "group" : "run";
}

/**
 * A registry that could not be read, named by its directory under the runs
 * directory: `short-ids/<case>` for one case's, or `short-ids` when the
 * cases cannot be listed at all.
 */
interface UnreadableRegistry {
	readonly registry: string;
	readonly reason: string;
}

interface ShortIdRegistries {
	readonly entries: readonly ShortIdEntry[];
	readonly unreadable: readonly UnreadableRegistry[];
}

export {
	REGISTRY_DIRECTORY,
	CLAIMS_DIRECTORY,
	BINDINGS_DIRECTORY,
	stageAttemptSchema,
	claimSchema,
	formatShortId,
	registryDirectory,
	shortIdKind,
};
export type {
	NamedRecord,
	ClaimSubject,
	ShortId,
	ShortIdEntry,
	UnreadableRegistry,
	ShortIdRegistries,
};
