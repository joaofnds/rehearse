import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { z } from "zod";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { parseCheckpointRecord } from "#benchmark/checkpoint";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { parseRunManifest } from "#benchmark/manifest";
import type { RunManifest } from "#benchmark/manifest";
import { checkpointsEntryForRun } from "#benchmark/run-layout";
import { pathIsWithin } from "#benchmark/path-containment";
import { replayRecordSchema } from "#benchmark/replay";
import {
	awaitingJudgeStageRecordSchema,
	stoppedStageDetailSchema,
	stoppedStageRecordSchema,
} from "#benchmark/run-outcome";
import { redactAbsolutePaths } from "./redact-path";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { transcriptInstructionLoadsFromLines } from "#benchmark/transcript-instruction-loads";
import {
	sessionHistoryAttemptCost,
	sessionHistoryDetailFromLine,
	sessionHistoryReport,
	sessionHistoryReportFromLines,
	sessionHistoryRequestCosts,
	sessionHistoryRequestSeries,
	sessionHistoryRequestSeriesFromLines,
	stageCorpusReconciliation,
} from "#benchmark/session-history";
import type {
	HistoryUnavailableReason,
	SessionHistoryAttemptCost,
	StageCorpusEntry,
	SessionHistoryDetail,
	SessionHistoryReport,
	SessionHistoryReportMetadata,
	SessionHistoryRequestCost,
	SessionHistoryRequestSeries,
} from "#benchmark/session-history";
import type { ContextRateCatalog } from "#benchmark/context-evidence-contract";
import type { TranscriptInstructionLoads } from "#benchmark/transcript-instruction-loads";

const identitySchema = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
	.brand("SavedIdentity");
type SavedIdentity = z.infer<typeof identitySchema>;

export class SessionHistoryReaderError extends Error {
	public override name = "SessionHistoryReaderError";

	public constructor(
		public readonly kind: "not-found" | "refused",
		message: string,
	) {
		super(message);
	}
}

interface SessionAttemptHistoryIdentity {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
}

interface ConfirmationAttemptHistoryIdentity {
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
}

interface StageHistoryIdentityInput {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

interface ReplayHistoryIdentityInput {
	readonly runsDirectory: string;
	readonly lineage: string;
	readonly timestamp: string;
}

const fileErrorSchema = z.object({ code: z.string() }).loose();

async function undefinedWhenMissing<T>(
	operation: () => Promise<T>,
): Promise<T | undefined> {
	try {
		return await operation();
	} catch (error) {
		const parsed = fileErrorSchema.safeParse(error);
		if (
			parsed.success &&
			(parsed.data.code === "ENOENT" || parsed.data.code === "ENOTDIR")
		) {
			return undefined;
		}
		throw error;
	}
}

function lstatWhenPresent(
	path: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
	return undefinedWhenMissing(() => lstat(path));
}

function realpathWhenPresent(path: string): Promise<string | undefined> {
	return undefinedWhenMissing(() => realpath(path));
}

function parseIdentity(value: string): SavedIdentity {
	const parsed = identitySchema.safeParse(value);
	if (!parsed.success) {
		throw new SessionHistoryReaderError(
			"refused",
			"Invalid saved-attempt identity",
		);
	}

	return parsed.data;
}

async function canonicalRunsRoot(runsDirectory: string): Promise<string> {
	const root = await realpathWhenPresent(runsDirectory);
	if (root === undefined) {
		throw new SessionHistoryReaderError("not-found", "No saved run directory");
	}

	return root;
}

async function verifiedDirectory(
	root: string,
	segments: readonly string[],
): Promise<string> {
	const directory = await verifiedDirectoryWhenPresent(root, segments);
	if (directory === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"No saved attempt at this identity",
		);
	}

	return directory;
}

/**
 * The absent directory is the only outcome this returns rather than throws.
 * A caller that falls back on absence must still be refused a traversing or
 * symlinked segment, so catching the thrown refusal instead of separating the
 * two would turn a refusal into a read.
 */
async function verifiedDirectoryWhenPresent(
	root: string,
	segments: readonly string[],
): Promise<string | undefined> {
	let current = root;
	for (const segment of segments) {
		const safeSegment = parseIdentity(segment);
		current = resolve(current, safeSegment);
		const status = await lstatWhenPresent(current);
		if (status === undefined) {
			return undefined;
		}
		if (status.isSymbolicLink() || !status.isDirectory()) {
			throw new SessionHistoryReaderError(
				"refused",
				"Saved-attempt path is not a real directory",
			);
		}
		const canonical = await realpathWhenPresent(current);
		if (canonical === undefined || !pathIsWithin(canonical, root)) {
			throw new SessionHistoryReaderError(
				"refused",
				"Saved-attempt path leaves the runs directory",
			);
		}
		current = canonical;
	}

	return current;
}

async function verifiedFile(
	root: string,
	directory: string,
	name: string,
	required: boolean,
): Promise<string | undefined> {
	const safeName = parseIdentity(name);
	const path = resolve(directory, safeName);
	const status = await lstatWhenPresent(path);
	if (status === undefined) {
		if (required) {
			throw new SessionHistoryReaderError(
				"not-found",
				"Saved-attempt evidence is unavailable",
			);
		}

		return undefined;
	}
	if (status.isSymbolicLink() || !status.isFile()) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved-attempt evidence is not a real file",
		);
	}
	const canonical = await realpathWhenPresent(path);
	if (canonical === undefined || !pathIsWithin(canonical, root)) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved-attempt evidence leaves the runs directory",
		);
	}

	return canonical;
}

async function openVerifiedFile(
	root: string,
	path: string,
): Promise<FileHandle> {
	const handle = await open(path, constants.O_RDONLY + constants.O_NOFOLLOW);
	try {
		const opened = await handle.stat();
		const canonical = await realpath(path);
		const current = await lstat(path);
		if (
			!opened.isFile() ||
			current.isSymbolicLink() ||
			!current.isFile() ||
			!pathIsWithin(canonical, root) ||
			opened.dev !== current.dev ||
			opened.ino !== current.ino
		) {
			throw new SessionHistoryReaderError(
				"refused",
				"Saved-attempt evidence changed during verification",
			);
		}
		return handle;
	} catch (error) {
		await handle.close();
		throw error;
	}
}

async function readVerifiedFile(root: string, path: string): Promise<string> {
	const handle = await openVerifiedFile(root, path);
	try {
		return await handle.readFile({ encoding: "utf8" });
	} finally {
		await handle.close();
	}
}

async function* readVerifiedLines(
	root: string,
	path: string,
): AsyncGenerator<string> {
	const handle = await openVerifiedFile(root, path);
	try {
		for await (const line of handle.readLines({ autoClose: false })) {
			yield line;
		}
	} finally {
		await handle.close();
	}
}

async function readVerifiedLine(
	root: string,
	path: string,
	selectedLine: number,
): Promise<string | undefined> {
	let lineNumber = 0;
	for await (const line of readVerifiedLines(root, path)) {
		lineNumber += 1;
		if (lineNumber === selectedLine) {
			return line;
		}
	}

	return undefined;
}

export interface RecordedEvidenceFile {
	readonly path: string;
	readonly text: string;
}

/** Resolve a comparison-recorded path without trusting any path component. */
export async function readRecordedEvidenceFile(
	runsDirectory: string,
	recordedPath: string,
): Promise<RecordedEvidenceFile> {
	if (isAbsolute(recordedPath)) {
		throw new SessionHistoryReaderError("refused", "Recorded path is absolute");
	}
	const root = await canonicalRunsRoot(runsDirectory);
	const recordedSegments = recordedPath.split(/[\\/]/u);
	const rootMarker = recordedSegments.lastIndexOf(basename(root));
	const segments =
		rootMarker === -1
			? recordedSegments.filter((segment) => segment !== ".")
			: recordedSegments.slice(rootMarker + 1);
	if (
		segments.length === 0 ||
		segments.some(
			(segment) => segment === "" || segment === "." || segment === "..",
		) ||
		(rootMarker === -1 && recordedSegments.includes(".."))
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"Recorded path has no confined runs-relative identity",
		);
	}
	const name = segments.pop();
	if (name === undefined) {
		throw new SessionHistoryReaderError("refused", "Recorded path is invalid");
	}
	const directory = await verifiedDirectory(root, segments);
	const file = await verifiedFile(root, directory, name, true);
	if (file === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Recorded evidence is missing",
		);
	}

	return { path: file, text: await readVerifiedFile(root, file) };
}

interface AttemptReadings {
	readonly metadata: SessionHistoryReportMetadata;
	readonly reportedCostUsd: number | undefined;
}

async function reportMetadata(
	root: string,
	attemptFile: string,
	id: string,
): Promise<AttemptReadings> {
	const attempt = parseSessionAttemptRecord(
		await readVerifiedFile(root, attemptFile),
	);

	return {
		metadata: {
			attempt: {
				kind: "session",
				caseId: attempt.caseId,
				id,
				model: attempt.model,
				outcome: attempt.outcome,
				corpusFiles: attempt.corpusFiles.map(({ path, resolvedPath }) => ({
					path,
					resolvedPath,
				})),
			},
			resolvedCorpusFiles: attempt.corpusFiles.map(
				({ path, resolvedPath }) => ({ path, resolvedPath }),
			),
			prefixLinesExcluded: attempt.transcriptDiagnostics?.prefixLinesExcluded,
			diagnostics: attempt.transcriptDiagnostics,
		},
		reportedCostUsd: attempt.metrics?.costUsd,
	};
}

interface ResolvedHistoryInput {
	readonly root: string;
	readonly metadata: SessionHistoryReportMetadata;
	readonly reportedCostUsd: number | undefined;
	readonly transcriptFile: string | undefined;
}

async function standaloneInput(
	identity: Readonly<SessionAttemptHistoryIdentity>,
): Promise<ResolvedHistoryInput> {
	const root = await canonicalRunsRoot(identity.runsDirectory);
	const directory = await verifiedDirectory(root, [
		"sessions",
		identity.caseId,
		identity.uuid,
	]);
	const attemptFile = await verifiedFile(root, directory, "attempt.json", true);
	if (attemptFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved attempt is unavailable",
		);
	}
	const transcriptFile = await verifiedFile(
		root,
		directory,
		"transcript.jsonl",
		false,
	);
	const { metadata, reportedCostUsd } = await reportMetadata(
		root,
		attemptFile,
		identity.uuid,
	);
	if (metadata.attempt.caseId !== identity.caseId) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved attempt does not own this case identity",
		);
	}

	return { root, metadata, reportedCostUsd, transcriptFile };
}

async function confirmationInput(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
): Promise<ResolvedHistoryInput> {
	const root = await canonicalRunsRoot(identity.runsDirectory);
	const groupDirectory = await verifiedDirectory(root, [
		"confirmations",
		identity.groupId,
	]);
	const repDirectory = await verifiedDirectory(root, [
		"confirmations",
		identity.groupId,
		"reps",
		identity.repId,
	]);
	const groupFile = await verifiedFile(
		root,
		groupDirectory,
		"group.json",
		true,
	);
	const repFile = await verifiedFile(root, repDirectory, "rep.json", true);
	const attemptFile = await verifiedFile(
		root,
		repDirectory,
		"attempt.json",
		true,
	);
	if (
		groupFile === undefined ||
		repFile === undefined ||
		attemptFile === undefined
	) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved confirmation attempt is unavailable",
		);
	}
	const group = parseConfirmationGroupRecord(
		await readVerifiedFile(root, groupFile),
	);
	const rep = parseConfirmationRepRecord(await readVerifiedFile(root, repFile));
	if (group.mode !== "session" || rep.mode !== "session") {
		throw new SessionHistoryReaderError(
			"refused",
			"Confirmation attempt is not a session",
		);
	}
	const expectedRepPath = relative(groupDirectory, repFile);
	const owned = group.repRecords.some(
		(reference) =>
			reference.repId === identity.repId && reference.path === expectedRepPath,
	);
	if (
		group.groupId !== identity.groupId ||
		rep.groupId !== identity.groupId ||
		rep.repId !== identity.repId ||
		!owned
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"Confirmation group does not own this rep",
		);
	}
	const transcriptFile = await verifiedFile(
		root,
		repDirectory,
		"transcript.jsonl",
		false,
	);
	const { metadata, reportedCostUsd } = await reportMetadata(
		root,
		attemptFile,
		identity.repId,
	);
	if (
		metadata.attempt.caseId !== group.caseId ||
		metadata.attempt.caseId !== rep.caseId
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"Confirmation attempt case identity differs",
		);
	}

	return { root, metadata, reportedCostUsd, transcriptFile };
}

/**
 * The manifest holding a run's case sits inside its checkpoints directory, and
 * it is the only place either a stage or a replay can learn which case it ran.
 */
async function runManifest(
	root: string,
	checkpointsDirectory: string,
): Promise<RunManifest> {
	const manifestFile = await verifiedFile(
		root,
		checkpointsDirectory,
		"manifest.json",
		true,
	);
	if (manifestFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved run manifest is unavailable",
		);
	}

	return parseRunManifest(await readVerifiedFile(root, manifestFile));
}

/**
 * A checkpoint records no case id and no run name, so the case is read from
 * the run's own manifest, which sits inside the checkpoints directory. That
 * only confirms the directory agrees with itself; the ownership check a stage
 * permits is its checkpoint's own stage field against the requested one.
 */
async function stageInput(
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<ResolvedHistoryInput> {
	const root = await canonicalRunsRoot(identity.runsDirectory);
	const checkpointsEntry = checkpointsEntryForRun(parseIdentity(identity.run));
	const checkpointsDirectory = await verifiedDirectory(root, [
		checkpointsEntry,
	]);
	const directory = await verifiedDirectoryWhenPresent(root, [
		checkpointsEntry,
		identity.stage,
	]);
	if (directory === undefined) {
		return unjudgedStageInput(root, checkpointsDirectory, identity);
	}
	const checkpointFile = await verifiedFile(
		root,
		directory,
		"checkpoint.json",
		true,
	);
	if (checkpointFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved stage checkpoint is unavailable",
		);
	}
	const checkpoint = parseCheckpointRecord(
		await readVerifiedFile(root, checkpointFile),
	);
	if (checkpoint.stage !== identity.stage) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved checkpoint does not own this stage identity",
		);
	}
	const manifest = await runManifest(root, checkpointsDirectory);
	const transcriptFile =
		checkpoint.transcript?.status === "AVAILABLE"
			? await verifiedFile(root, directory, checkpoint.transcript.file, false)
			: undefined;

	return {
		root,
		metadata: {
			attempt: {
				kind: "stage",
				caseId: manifest.caseId,
				run: identity.run,
				stage: checkpoint.stage,
				lineage: checkpoint.lineage,
				upstream: checkpoint.upstream,
				model: checkpoint.model,
				effort: checkpoint.effort,
				corpusFiles: checkpoint.corpusFiles.map(({ path, sha256 }) => ({
					path,
					sha256,
				})),
			},
			resolvedCorpusFiles: [],
			unavailableReason: stageUnavailableReason(
				checkpoint.transcript?.status,
				transcriptFile !== undefined,
			),
			prefixLinesExcluded: 0,
		},
		reportedCostUsd: undefined,
		transcriptFile,
	};
}

/**
 * A stage that wrote no checkpoint directory leaves a record beside the run's
 * checkpoints instead, and two terminal states write one: the run stopped on
 * this stage, or the run died between the stage's session finishing and its
 * judging completing. Neither record identifies the stage among the run's
 * others, so the case and the model come from the run manifest and no lineage
 * is reported at all. Each record's own parsed transcript stays out of the
 * report, which is what the unavailable state is for.
 */
async function unjudgedStageInput(
	root: string,
	checkpointsDirectory: string,
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<ResolvedHistoryInput> {
	const recordFile = await verifiedFile(
		root,
		root,
		`${identity.run}.${identity.stage}.json`,
		false,
	);
	if (recordFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"No saved attempt at this identity",
		);
	}

	const contents: unknown = JSON.parse(
		await readVerifiedFile(root, recordFile),
	);
	const stopped = stoppedStageRecordSchema.safeParse(contents);
	const awaitingJudge = awaitingJudgeStageRecordSchema.safeParse(contents);
	const recordedStage = stopped.success
		? stopped.data.stage
		: awaitingJudge.data?.stage;
	if (recordedStage === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"No saved attempt at this identity",
		);
	}
	if (recordedStage !== identity.stage) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved stage record does not own this stage identity",
		);
	}

	const detail = stoppedStageDetailSchema.safeParse(contents);
	const declared = detail.success ? detail.data : {};
	const manifest = await runManifest(root, checkpointsDirectory);
	const common = {
		caseId: manifest.caseId,
		run: identity.run,
		stage: recordedStage,
		model: declared.model ?? manifest.model,
		corpusFiles: declared.corpusFiles ?? [],
	};

	return {
		root,
		metadata: {
			...(stopped.success
				? stoppedStageMetadata(common, stopped.data.error)
				: awaitingJudgeStageMetadata(common)),
			resolvedCorpusFiles: [],
			prefixLinesExcluded: 0,
		},
		reportedCostUsd: undefined,
		transcriptFile: undefined,
	};
}

/**
 * The fields both records share, before each names the state it rests in.
 */
interface UnjudgedStageFields {
	readonly caseId: string;
	readonly run: string;
	readonly stage: string;
	readonly model: string;
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
}

/**
 * The stop's reason is whatever the harness wrote, the only record-derived
 * sentence this report carries, so it is redacted here rather than at the
 * error path that covers every other one.
 */
function stoppedStageMetadata(
	fields: Readonly<UnjudgedStageFields>,
	error: string,
): Pick<SessionHistoryReportMetadata, "attempt" | "unavailableReason"> {
	return {
		attempt: {
			kind: "stopped-stage",
			...fields,
			error: redactAbsolutePaths(error),
		},
		unavailableReason: "stage-stopped",
	};
}

/**
 * Nothing failed here, so the record carries no reason to redact: the run
 * ended before a verdict on this stage existed.
 */
function awaitingJudgeStageMetadata(
	fields: Readonly<UnjudgedStageFields>,
): Pick<SessionHistoryReportMetadata, "attempt" | "unavailableReason"> {
	return {
		attempt: { kind: "awaiting-judge-stage", ...fields },
		unavailableReason: "stage-judging-never-completed",
	};
}

/**
 * A stage session resumes no earlier session, so a transcript it has is the
 * whole of its own history. Which fact left it without one is what these states
 * distinguish, the last of them a checkpoint whose own record disagrees with
 * what is beside it.
 */
function stageUnavailableReason(
	status: "AVAILABLE" | "UNAVAILABLE" | undefined,
	filePresent: boolean,
): HistoryUnavailableReason | undefined {
	if (status === "AVAILABLE") {
		return filePresent ? undefined : "recorded-transcript-missing";
	}

	return status === "UNAVAILABLE"
		? "provider-wrote-none"
		: "no-capture-recorded";
}

/**
 * A replay is filed under the lineage it consumed rather than under a run, so
 * the directory name is the caller's and the consumed lineage is what confirms
 * it. The record's own lineage is the one the replay produced and names no
 * directory. It keeps no raw transcript: the worktree whose name locates the
 * provider's copy is removed when the replay finishes. Its parsed exchanges
 * stay out of the report, which is what the unavailable state is for.
 */
async function replayInput(
	identity: Readonly<ReplayHistoryIdentityInput>,
): Promise<ResolvedHistoryInput> {
	const root = await canonicalRunsRoot(identity.runsDirectory);
	const directory = await verifiedDirectory(root, [
		"replays",
		identity.lineage,
	]);
	const recordFile = await verifiedFile(
		root,
		directory,
		`${identity.timestamp}.json`,
		true,
	);
	if (recordFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved replay record is unavailable",
		);
	}
	const record = replayRecordSchema.parse(
		JSON.parse(await readVerifiedFile(root, recordFile)),
	);
	if (record.consumed.lineage !== identity.lineage) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved replay does not own this lineage identity",
		);
	}
	const manifest = await runManifest(
		root,
		await verifiedDirectory(root, [
			checkpointsEntryForRun(parseIdentity(record.runName)),
		]),
	);

	return {
		root,
		metadata: {
			attempt: {
				kind: "stage",
				caseId: manifest.caseId,
				run: record.runName,
				stage: record.stage,
				lineage: record.lineage,
				upstream: record.consumed.lineage,
				model: record.model,
				effort: record.effort,
				corpusFiles: record.corpusFiles.map(({ path, sha256 }) => ({
					path,
					sha256,
				})),
			},
			resolvedCorpusFiles: [],
			unavailableReason: "replay-retains-none",
			prefixLinesExcluded: 0,
		},
		reportedCostUsd: undefined,
		transcriptFile: undefined,
	};
}

function reportFor(
	input: Readonly<ResolvedHistoryInput>,
): Promise<SessionHistoryReport> {
	return input.transcriptFile === undefined
		? Promise.resolve(
				sessionHistoryReport({ ...input.metadata, transcript: undefined }),
			)
		: sessionHistoryReportFromLines(
				input.metadata,
				readVerifiedLines(input.root, input.transcriptFile),
			);
}

async function detailFor(
	input: Readonly<ResolvedHistoryInput>,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	if (input.transcriptFile === undefined) {
		return undefined;
	}
	const report = await reportFor(input);
	const event = [
		...report.startingContext,
		...report.attemptEvents,
		...report.boundaryUnknown,
	].find(({ id }) => id === eventId);
	if (event === undefined) {
		return undefined;
	}
	const line = await readVerifiedLine(
		input.root,
		input.transcriptFile,
		event.locator.line,
	);

	return line === undefined
		? undefined
		: sessionHistoryDetailFromLine(
				report,
				input.metadata.resolvedCorpusFiles,
				eventId,
				line,
			);
}

export async function readSessionAttemptHistory(
	identity: Readonly<SessionAttemptHistoryIdentity>,
): Promise<SessionHistoryReport> {
	return reportFor(await standaloneInput(identity));
}

export async function readSessionAttemptHistoryDetail(
	identity: Readonly<SessionAttemptHistoryIdentity>,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	return detailFor(await standaloneInput(identity), eventId);
}

export async function readStageHistory(
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<SessionHistoryReport> {
	return reportFor(await stageInput(identity));
}

export async function readStageHistoryDetail(
	identity: Readonly<StageHistoryIdentityInput>,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	return detailFor(await stageInput(identity), eventId);
}

export async function readReplayHistory(
	identity: Readonly<ReplayHistoryIdentityInput>,
): Promise<SessionHistoryReport> {
	return reportFor(await replayInput(identity));
}

export async function readStageCorpusReconciliation(
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<readonly StageCorpusEntry[]> {
	return stageCorpusReconciliation(await readStageHistory(identity));
}

export async function readConfirmationAttemptHistory(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
): Promise<SessionHistoryReport> {
	return reportFor(await confirmationInput(identity));
}

export async function readConfirmationAttemptHistoryDetail(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	return detailFor(await confirmationInput(identity), eventId);
}

export interface SessionHistoryRequestCostEntry {
	readonly line: number;
	readonly cost: SessionHistoryRequestCost;
}

export interface SessionHistoryAttemptSeries {
	readonly series: SessionHistoryRequestSeries;
	readonly cost: SessionHistoryAttemptCost;
	/**
	 * Keyed by line rather than requestId: a request recording no id still
	 * occupies a row, and a Map does not survive the route's JSON encoding.
	 */
	readonly requestCosts: readonly SessionHistoryRequestCostEntry[];
	readonly instructionLoads: TranscriptInstructionLoads;
}

/**
 * The series decoder validates only the two row kinds it reads, which is what
 * keeps a series over the largest saved transcript fast, and an instructions
 * attachment is a third kind. Rather than widen that schema, the loads take
 * their own streamed pass: measured at 10ms over the largest saved transcript
 * (3.9MB), against the coordination a shared single pass would need.
 */
async function seriesFor(
	input: Readonly<ResolvedHistoryInput>,
	rates: ContextRateCatalog | undefined,
): Promise<SessionHistoryAttemptSeries> {
	const { transcriptFile } = input;
	const series =
		transcriptFile === undefined
			? sessionHistoryRequestSeries({
					transcript: undefined,
					prefixLinesExcluded: input.metadata.prefixLinesExcluded,
				})
			: await sessionHistoryRequestSeriesFromLines(
					{ prefixLinesExcluded: input.metadata.prefixLinesExcluded },
					readVerifiedLines(input.root, transcriptFile),
				);

	return {
		series,
		cost: sessionHistoryAttemptCost({
			series,
			reportedCostUsd: input.reportedCostUsd,
			rates,
		}),
		requestCosts: [...sessionHistoryRequestCosts(series, rates)].map(
			([line, cost]) => ({ line, cost }),
		),
		instructionLoads:
			transcriptFile === undefined
				? { state: "unavailable" }
				: await transcriptInstructionLoadsFromLines(
						readVerifiedLines(input.root, transcriptFile),
					),
	};
}

export async function readSessionAttemptRequestSeries(
	identity: Readonly<SessionAttemptHistoryIdentity>,
	rates?: ContextRateCatalog,
): Promise<SessionHistoryAttemptSeries> {
	return seriesFor(await standaloneInput(identity), rates);
}

export async function readConfirmationAttemptRequestSeries(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
	rates?: ContextRateCatalog,
): Promise<SessionHistoryAttemptSeries> {
	return seriesFor(await confirmationInput(identity), rates);
}
