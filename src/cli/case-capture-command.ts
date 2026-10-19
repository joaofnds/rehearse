import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { CaseDeclaration, SessionCaseDeclaration } from "#benchmark/case";
import {
	caseDeclarationPath,
	casesRoot,
	readCaseDeclaration,
	transcriptPrefixPath,
} from "#benchmark/case";
import { asRefusedPrecondition } from "#benchmark/preflight";
import { sessionAttemptIds, sessionAttemptPaths } from "#benchmark/run-layout";
import {
	CaptureError,
	captureTranscriptPrefix,
	resolveSessionFile,
	transcriptsUnder,
} from "#benchmark/session-capture";
import { UsageError } from "#cli/command-usage";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";

import { serialize, serializeCommitted } from "./case-declaration-output";

interface CaseCaptureRequest {
	readonly caseId: string | undefined;
	readonly session: string | undefined;
	readonly cut: string | undefined;
	readonly json: boolean;
}

interface CaseCaptureDependencies {
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
	const declaration: CaseDeclaration = await asRefusedPrecondition(
		async () => await readCaseDeclaration(caseId, root),
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
		return await captureTranscriptPrefix({
			cut,
			destinationPath,
			sourcePath,
		});
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

async function runCaseCapture(
	request: CaseCaptureRequest,
	dependencies: CaseCaptureDependencies,
): Promise<void> {
	const caseId = requiredFlag(request.caseId, "the case id");
	const session = requiredFlag(request.session, "--session");
	const cut = parsedCut(requiredFlag(request.cut, "--cut"));
	const root = dependencies.casesDirectory ?? casesRoot();
	const declaration = await requireSessionDeclaration(caseId, root);

	const updated = await captureDeclaredSession(
		{ caseId, cut, declaration, root, session },
		dependencies,
	);

	dependencies.output.stdout(
		request.json
			? serialize(updated)
			: `${caseDeclarationPath(caseId, root)}\n`,
	);
}

interface DeclaredSessionCapture {
	readonly caseId: string;
	readonly session: string;
	readonly cut: number;
	readonly root: string;
	readonly declaration: SessionCaseDeclaration;
}

async function captureDeclaredSession(
	request: DeclaredSessionCapture,
	dependencies: CaseCaptureDependencies,
): Promise<SessionCaseDeclaration> {
	const { caseId, session, cut, root, declaration } = request;
	const source = await resolved(dependencies, session);
	const file = `${source.sessionId}-cut-${String(cut)}.jsonl`;
	const destination = transcriptPrefixPath(caseId, file, root);

	await mkdir(dirname(destination), { recursive: true });
	const prefix = await captured(source.path, destination, cut);

	const updated: SessionCaseDeclaration = {
		...declaration,
		transcript: {
			cut,
			file,
			sha256: prefix.sha256,
			sourceSession: source.sessionId,
		},
	};

	await Bun.write(
		caseDeclarationPath(caseId, root),
		await serializeCommitted(updated),
	);

	return updated;
}

export { runCaseCapture as default };
export type { CaseCaptureDependencies, CaseCaptureRequest };
