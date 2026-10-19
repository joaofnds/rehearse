import { basename } from "node:path";

import type { SessionCaseDeclaration } from "./case";
import { parseCaseDeclaration } from "./case";
import type { FrozenFile, LoadedFrozenFile } from "./comparison-evidence";
import type { LoadArmRequest } from "./comparison-evidence-files";
import { evidenceError } from "./comparison-evidence-files";
import type { VerifiedFrozenFiles } from "./comparison-frozen-evidence";
import {
	assertSessionCorpusFiles,
	assertSessionGroupExecution,
} from "./comparison-session-frozen-declaration";
import sessionFrozenPath from "./comparison-session-frozen-paths";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const SINGLE_ITEM_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

interface SessionFrozenInputs {
	readonly sessionCase: Immutable<SessionCaseDeclaration>;
	readonly files: readonly LoadedFrozenFile[];
	readonly corpusFiles: readonly FrozenFile[];
	readonly sourcePaths: readonly string[];
}

function sessionCaseFile(
	request: Readonly<LoadArmRequest>,
	files: readonly LoadedFrozenFile[],
): LoadedFrozenFile {
	const caseFiles = files.filter(({ record }) => record.kind === "case");
	if (caseFiles.length !== SINGLE_ITEM_COUNT) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: "inputs.files.case" },
			`source group records ${caseFiles.length} case files; expected exactly one`,
		);
	}

	const [caseFile] = caseFiles;
	if (caseFile === undefined) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: "inputs.files.case" },
			"source group records no case file",
		);
	}
	return caseFile;
}

function assertSessionFrozenFiles(
	request: Readonly<LoadArmRequest>,
	group: Immutable<ParsedConfirmationGroupRecord>,
	frozen: Readonly<VerifiedFrozenFiles>,
): SessionFrozenInputs {
	const sessionCase = readFrozenSessionCase(
		request,
		sessionCaseFile(request, frozen.files),
	);
	assertSessionFixtureFiles(request, sessionCase, frozen.files);
	assertSessionTranscriptFiles(request, sessionCase, frozen.files);
	const corpusFiles = assertSessionCorpusFiles(
		request,
		sessionCase,
		frozen.files,
	);
	assertSessionGroupExecution(request, sessionCase, group);
	return {
		corpusFiles: corpusFiles.map(({ record }) => record),
		files: frozen.files,
		sessionCase,
		sourcePaths: frozen.sourcePaths,
	};
}

function readFrozenSessionCase(
	request: Readonly<LoadArmRequest>,
	caseFile: LoadedFrozenFile,
): SessionCaseDeclaration {
	try {
		const parsed = parseCaseDeclaration(request.caseId, caseFile.text);
		if (parsed.kind !== "session") {
			throw new Error("frozen case is not a session declaration");
		}
		return parsed;
	} catch {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: "inputs.files[case].record",
			},
			"invalid session case declaration",
		);
	}
}

function assertSessionFixtureFiles(
	request: Readonly<LoadArmRequest>,
	sessionCase: Immutable<SessionCaseDeclaration>,
	files: readonly LoadedFrozenFile[],
): void {
	const fixtureFiles = files.filter(({ record }) => record.kind === "fixture");
	if (
		sessionCase.fixture === undefined &&
		fixtureFiles.length > EMPTY_COLLECTION_LENGTH
	) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: "inputs.files.fixture",
			},
			"session case declares no fixture but source group records fixture files",
		);
	}
}

function assertSessionTranscriptFiles(
	request: Readonly<LoadArmRequest>,
	sessionCase: Immutable<SessionCaseDeclaration>,
	files: readonly LoadedFrozenFile[],
): void {
	const transcriptFiles = files.filter(
		({ record }) => record.kind === "transcript",
	);
	if (
		(sessionCase.transcript === undefined &&
			transcriptFiles.length > EMPTY_COLLECTION_LENGTH) ||
		(sessionCase.transcript !== undefined &&
			transcriptFiles.length !== SINGLE_ITEM_COUNT)
	) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: "inputs.files.transcript",
			},
			`source group records ${transcriptFiles.length} transcript files for the declared session input`,
		);
	}
	if (sessionCase.transcript !== undefined) {
		const [transcriptFile] = transcriptFiles;
		if (transcriptFile === undefined) {
			throw evidenceError(
				{
					arm: request.role,
					caseId: request.caseId,
					field: "inputs.files.transcript",
				},
				"source group records no transcript file",
			);
		}
		assertSessionTranscriptRecord(
			request,
			sessionCase.transcript,
			transcriptFile,
		);
	}
}

function assertSessionTranscriptRecord(
	request: Readonly<LoadArmRequest>,
	transcript: NonNullable<SessionCaseDeclaration["transcript"]>,
	transcriptFile: LoadedFrozenFile,
): void {
	const transcriptPath = sessionFrozenPath(request, transcriptFile.record);
	if (transcriptPath !== basename(transcript.file)) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: "inputs.files.transcript.path",
			},
			"frozen transcript path disagrees with the session case declaration",
		);
	}
	if (transcriptFile.record.sha256 !== transcript.sha256) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: "inputs.files.transcript.sha256",
			},
			"frozen transcript digest disagrees with the session case declaration",
		);
	}
}

export { assertSessionFrozenFiles as default };
