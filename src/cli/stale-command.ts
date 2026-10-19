import type { StaleCliConfig } from "#benchmark/config";
import type {
	CorpusSourceResolver,
	ResolvedCorpusSource,
} from "#benchmark/corpus-source";
import {
	CorpusSourceError,
	resolveCorpusSource,
} from "#benchmark/corpus-source";
import type { RecordStaleness } from "#benchmark/staleness-report";
import {
	checkpointStaleness,
	groupStaleness,
	replayAttemptStaleness,
	sessionAttemptStaleness,
} from "#benchmark/staleness-report";
import corpusRefusal from "#cli/corpus-failures";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";
import { writeUnreadable } from "#cli/output";
import { parseRecordId } from "#cli/record-id";
import {
	NO_SHORT_ID,
	checkpointShortId,
	shortIdsByRecordId,
} from "#cli/short-id-column";

/**
 * The knobs a session is about to replay with, not the ones a run was recorded
 * with: comparing a checkpoint against its own manifest is tautologically equal,
 * so the model and effort come from the flags and the environment the way
 * `replay` reads them.
 */
interface StaleRequest extends StaleCliConfig {
	readonly runsDirectory: string;
}

interface StaleDependencies {
	readonly output: CommandOutput;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
}

/**
 * A corpus that does not resolve, or that lacks a file a recorded checkpoint
 * has to be compared against, is a precondition the command refuses rather
 * than a malformed command line: `--corpus /absent` is well formed and names a
 * directory that is not there, which is the same shape as a case id naming no
 * case.
 */
async function refusingCorpusFailures<Answer>(
	work: () => Promise<Answer>,
): Promise<Answer> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof CorpusSourceError) {
			throw new RefusedPreconditionError(error.message);
		}

		if (error instanceof Error) {
			const refusal = corpusRefusal(error);
			if (refusal !== undefined) {
				throw refusal;
			}
		}

		throw error;
	}
}

function distanceReading({ distance }: RecordStaleness): string {
	return distance.kind === "measured"
		? `distance ${distance.versions}`
		: "distance not recorded";
}

function line(record: RecordStaleness, shortId: string): string {
	return `${[record.id, shortId, distanceReading(record), ...record.causes].join("\t")}\n`;
}

/**
 * A checkpoint's short id, printed second as `list` prints it, so a reader
 * finds both ids of a record in the first two columns whatever its kind.
 */
async function shortIdOf(
	record: RecordStaleness,
	runsDirectory: string,
	shortIds: ReadonlyMap<string, string>,
): Promise<string> {
	const id = parseRecordId(record.id);
	const shortId =
		id.kind === "checkpoint"
			? await checkpointShortId(runsDirectory, shortIds, {
					run: id.run,
					stage: id.stage,
				})
			: shortIds.get(record.id);

	return shortId ?? NO_SHORT_ID;
}

/**
 * Reports what an edit invalidated and delivers nothing, so unlike run and
 * replay it accepts `--corpus` for a stage's skills: the refusal those two
 * make exists because a project-level skill cannot shadow a user-level one,
 * and hashing a skill needs no install at all.
 */
async function runStale(
	request: StaleRequest,
	dependencies: StaleDependencies,
): Promise<void> {
	const source = await refusingCorpusFailures(
		async () =>
			await (dependencies.resolveCorpus ?? resolveCorpusSource)(request.corpus),
	);

	await refusingCorpusFailures(async () => {
		await report(request, source, dependencies.output);
	});
}

async function report(
	request: StaleRequest,
	source: ResolvedCorpusSource,
	output: CommandOutput,
): Promise<void> {
	const attempts = await sessionAttemptStaleness(request.runsDirectory, source);
	const replays = await replayAttemptStaleness(
		request.runsDirectory,
		source,
		request,
	);
	const groups = await groupStaleness(request.runsDirectory, source, request);
	const checkpoints = await checkpointStaleness(
		request.runsDirectory,
		source,
		request,
	);
	const stale = [
		...checkpoints.records.filter((record) => record.stale),
		...attempts.records.filter((record) => record.stale),
		...replays.records.filter((record) => record.stale),
		...groups.records.filter((record) => record.stale),
	];

	const { shortIds, unreadable } = await shortIdsByRecordId(
		request.runsDirectory,
	);

	writeUnreadable(output, [
		...checkpoints.unreadable,
		...attempts.unreadable,
		...replays.unreadable,
		...groups.unreadable,
		...unreadable,
	]);
	await Array.fromAsync(stale, async (record) => {
		output.stdout(
			line(record, await shortIdOf(record, request.runsDirectory, shortIds)),
		);
	});
}

export { runStale as default };
export type { StaleDependencies, StaleRequest };
