import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
	CaseDeclaration,
	LoadedCase,
	SessionCaseDeclaration,
} from "#benchmark/case";
import {
	caseDeclarationPath,
	casesRoot,
	listCases,
	loadCase,
	readCaseDeclaration,
	transcriptPrefixPath,
} from "#benchmark/case";
import { asRefusedPrecondition } from "#benchmark/preflight";
import { projectFormatted } from "#benchmark/project-format";
import { sessionAttemptIds, sessionAttemptPaths } from "#benchmark/run-layout";
import {
	captureTranscriptPrefix,
	CaptureError,
	resolveSessionFile,
	transcriptsUnder,
} from "#benchmark/session-capture";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";

export function requireCase(caseId: string): Promise<LoadedCase> {
	return asRefusedPrecondition(() => loadCase(caseId));
}

function declarationFile(caseId: string, root?: string): string {
	return caseDeclarationPath(caseId, root ?? casesRoot());
}

function serialize(
	record: CaseDeclaration | readonly CaseDeclaration[],
): string {
	return `${JSON.stringify(record, null, 2)}\n`;
}

/**
 * A case declaration is committed, so it is written as the project's formatter
 * would leave it and the format check stays green without another step.
 */
function serializeCommitted(declaration: CaseDeclaration): Promise<string> {
	return projectFormatted("case.json", JSON.stringify(declaration, null, "\t"));
}

export interface CaseListRequest {
	readonly json: boolean;
	readonly includeArchived?: boolean;
}

export async function runCaseList(
	request: CaseListRequest,
	output: CommandOutput,
): Promise<void> {
	const listing = await asRefusedPrecondition(() =>
		listCases(undefined, { includeArchived: request.includeArchived ?? false }),
	);
	for (const { reason } of listing.unreadable) {
		output.stderr(`${reason}\n`);
	}
	if (request.json) {
		output.stdout(serialize(listing.declarations));

		return;
	}

	for (const declaration of listing.declarations) {
		output.stdout(`${declaration.id}\t${declaration.title}\n`);
	}
}

export interface CaseShowRequest {
	readonly caseId: string | undefined;
	readonly json: boolean;
}

export async function runCaseShow(
	request: CaseShowRequest,
	output: CommandOutput,
): Promise<void> {
	const { caseId } = request;
	if (caseId === undefined) {
		throw new UsageError("Provide the case id: rehearse case show <case-id>");
	}

	const declaration: CaseDeclaration = await asRefusedPrecondition(() =>
		readCaseDeclaration(caseId),
	);

	output.stdout(
		request.json ? serialize(declaration) : `${declarationFile(caseId)}\n`,
	);
}

export interface CaseCaptureRequest {
	readonly caseId: string | undefined;
	readonly session: string | undefined;
	readonly cut: string | undefined;
	readonly json: boolean;
}

export interface CaseCaptureDependencies {
	readonly projectsDirectory: string;
	readonly runsDirectory: string;
	readonly output: CommandOutput;
	readonly casesDirectory?: string | undefined;
}

function requiredFlag(value: string | undefined, flag: string): string {
	if (value === undefined || value === "") {
		throw new UsageError(
			`Provide ${flag}: rehearse case capture <case-id> --session <id> --cut <index>`,
		);
	}

	return value;
}

function parsedCut(value: string): number {
	const cut = Number(value);
	if (!Number.isInteger(cut)) {
		throw new UsageError(`Cut ${value} is not an integer`);
	}

	return cut;
}

async function requireSessionDeclaration(
	caseId: string,
	root: string,
): Promise<SessionCaseDeclaration> {
	const declaration: CaseDeclaration = await asRefusedPrecondition(() =>
		readCaseDeclaration(caseId, root),
	);
	if (declaration.kind !== "session") {
		throw new RefusedPreconditionError(
			`Case ${caseId} is a pipeline case; only a session case holds a transcript prefix`,
		);
	}

	return declaration;
}

/**
 * A cut the source cannot satisfy is a value the command line got wrong, so it
 * exits 2; a session id that names no file is a precondition the command
 * refuses, so it exits 3. Both arrive here as one CaptureError and are told
 * apart by which input the failure is about.
 */
async function captured(
	sourcePath: string,
	destinationPath: string,
	cut: number,
): Promise<Awaited<ReturnType<typeof captureTranscriptPrefix>>> {
	try {
		return await captureTranscriptPrefix(sourcePath, destinationPath, cut);
	} catch (error) {
		if (error instanceof CaptureError) {
			throw new UsageError(error.message);
		}

		throw error;
	}
}

/**
 * The provider's own sessions and the ones the harness saved are both sources a
 * capture can name, and the harness's live under a layout `run-layout` owns
 * rather than under a slug, so each store is enumerated by whoever knows its
 * shape.
 */
async function sourceTranscripts(
	dependencies: CaseCaptureDependencies,
): Promise<readonly string[]> {
	const attempts = await sessionAttemptIds(dependencies.runsDirectory);

	return [
		...(await transcriptsUnder(dependencies.projectsDirectory)),
		...attempts.map(
			(attempt) =>
				sessionAttemptPaths(dependencies.runsDirectory, attempt).transcriptFile,
		),
	];
}

async function resolved(
	dependencies: CaseCaptureDependencies,
	session: string,
): Promise<Awaited<ReturnType<typeof resolveSessionFile>>> {
	try {
		return await resolveSessionFile(
			await sourceTranscripts(dependencies),
			session,
		);
	} catch (error) {
		if (error instanceof CaptureError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}

export async function runCaseCapture(
	request: CaseCaptureRequest,
	dependencies: CaseCaptureDependencies,
): Promise<void> {
	const caseId = requiredFlag(request.caseId, "the case id");
	const session = requiredFlag(request.session, "--session");
	const cut = parsedCut(requiredFlag(request.cut, "--cut"));
	const root = dependencies.casesDirectory ?? casesRoot();
	const declaration = await requireSessionDeclaration(caseId, root);

	const source = await resolved(dependencies, session);
	const file = `${source.sessionId}-cut-${String(cut)}.jsonl`;
	const destination = transcriptPrefixPath(caseId, file, root);
	await mkdir(dirname(destination), { recursive: true });
	const prefix = await captured(source.path, destination, cut);

	const updated: SessionCaseDeclaration = {
		...declaration,
		transcript: {
			file,
			sha256: prefix.sha256,
			sourceSession: source.sessionId,
			cut,
		},
	};
	await Bun.write(
		declarationFile(caseId, root),
		await serializeCommitted(updated),
	);

	dependencies.output.stdout(
		request.json ? serialize(updated) : `${declarationFile(caseId, root)}\n`,
	);
}
