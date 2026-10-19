import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { unhandled } from "#benchmark/contracts";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type { JsonValue } from "#benchmark/json-value";
import { parseSessionAttemptRecord } from "#benchmark/session-record";

import type { ContextLink, PipelineRunRow, RunHistoryRow } from "./run-history";

function stageLink(run: string, stage: string): ContextLink {
	return {
		href: `/runs/${run}/stages/${stage}`,
		label: stage,
		state: "available",
	};
}

/**
 * Every entry under a directory, keyed by its relative path: a file with the
 * size and modification time a write would change, a directory only by its
 * presence, since adding a child changes its time.
 */
async function fileStates(directory: string): Promise<Map<string, string>> {
	const states = new Map<string, string>();
	await Array.fromAsync(
		await readdir(directory, { recursive: true }),
		async (path) => {
			const found = await stat(join(directory, path));
			states.set(
				path,
				found.isFile()
					? `${String(found.size)}:${String(found.mtimeMs)}`
					: "directory",
			);
		},
	);

	return states;
}

/** Adds the corpus version a newer writer records to a record on disk. */
async function recordCorpusVersion(
	file: string,
	corpusVersion: CorpusMeasurement,
): Promise<void> {
	const recorded = z
		.object({})
		.loose()
		.parse(JSON.parse(await Bun.file(file).text()));
	await Bun.write(file, `${JSON.stringify({ ...recorded, corpusVersion })}\n`);
}

/** Adds the corpus version to a group record's frozen inputs on disk. */
async function recordGroupCorpusVersion(
	file: string,
	corpusVersion: CorpusMeasurement,
): Promise<void> {
	const recorded = z
		.object({ inputs: z.object({}).loose() })
		.loose()
		.parse(JSON.parse(await Bun.file(file).text()));
	await Bun.write(
		file,
		`${JSON.stringify({ ...recorded, inputs: { ...recorded.inputs, corpusVersion } })}\n`,
	);
}

/** Adds the start time a newer writer records to a record on disk. */
async function recordStartedAt(file: string, startedAt: string): Promise<void> {
	const recorded = z
		.object({})
		.loose()
		.parse(JSON.parse(await Bun.file(file).text()));
	await Bun.write(file, `${JSON.stringify({ ...recorded, startedAt })}\n`);
}

/** A row by its kind and the identity that kind lists it under. */
function rowName(row: RunHistoryRow): string {
	switch (row.kind) {
		case "run": {
			return `run ${row.run}`;
		}
		case "replay": {
			return `replay ${row.timestamp}`;
		}
		case "session-attempt": {
			return `attempt ${row.uuid}`;
		}
		case "group": {
			return `group ${row.groupId}`;
		}
		default: {
			return unhandled(row, "run history row kind");
		}
	}
}

function pipelineRun(
	rows: readonly RunHistoryRow[],
	run: string,
): PipelineRunRow | undefined {
	return rows.find(
		(row): row is PipelineRunRow => row.kind === "run" && row.run === run,
	);
}

type SessionAttemptPatch = Readonly<Record<string, JsonValue>>;

async function rewriteHistorySessionAttempt(
	file: string,
	changes: SessionAttemptPatch,
): Promise<void> {
	const record = parseSessionAttemptRecord(await Bun.file(file).text());
	await Bun.write(file, JSON.stringify({ ...record, ...changes }));
}

export {
	rewriteHistorySessionAttempt,
	stageLink,
	fileStates,
	recordCorpusVersion,
	recordGroupCorpusVersion,
	recordStartedAt,
	rowName,
	pipelineRun,
};
