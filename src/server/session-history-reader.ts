import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { z } from "zod";
import { basename, isAbsolute, relative, resolve } from "node:path";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { pathIsWithin } from "#benchmark/path-containment";
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
} from "#benchmark/session-history";
import type {
	SessionHistoryAttemptCost,
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
	let current = root;
	for (const segment of segments) {
		const safeSegment = parseIdentity(segment);
		current = resolve(current, safeSegment);
		const status = await lstatWhenPresent(current);
		if (status === undefined) {
			throw new SessionHistoryReaderError(
				"not-found",
				"No saved attempt at this identity",
			);
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
