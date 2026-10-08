import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";
import { buildComparableComparison } from "./comparison-comparability";
import type {
	DeclaredConfirmationGroup,
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
} from "./confirmation-record";
import {
	parseConfirmationRepRecord,
	parseDeclaredConfirmationGroup,
} from "./confirmation-record";
import { parseCaseDeclaration } from "./case";
import type { SessionCaseDeclaration } from "./case";
import type { Immutable } from "./contracts";
import { unhandled } from "./contracts";
import type {
	ComparisonEvidence,
	DigestedComparisonRep,
	DigestedRecord,
	FrozenFile,
	LoadedComparisonArmEvidence,
	LoadedComparisonArmGroups,
	LoadedComparisonCaseEvidence,
	LoadedFrozenFile,
} from "./comparison-evidence";
import { ComparisonEvidenceError } from "./comparison-evidence";
import type { ComparisonArm, ComparisonManifest } from "./comparison-record";
import { COMPARISON_ARMS, parseComparisonManifest } from "./comparison-record";
import { deliversCorpusFile } from "./session-corpus";
import { parseSessionAttemptRecord } from "./session-record";
import { stageGradingRecordSchema } from "./comparison-stage-grading";
import type { StageGradingRecord } from "./comparison-stage-grading";
import type { SessionAttemptRecord } from "./session-record";

export const REQUIRED_FROZEN_INPUT_KINDS = [
	"checkpoint",
	"corpus",
	"rubric",
	"pipeline",
	"instructions",
	"task",
	"product-brief",
] as const;

interface EvidenceLocation {
	readonly caseId: string;
	readonly arm: ComparisonArm | "all";
	readonly field: string;
}

interface ReadEvidenceFileRequest extends EvidenceLocation {
	readonly path: string;
}

interface EvidenceFile {
	readonly canonicalPath: string;
	readonly sha256: string;
	readonly text: string;
}

function evidenceError(
	location: Readonly<EvidenceLocation>,
	message: string,
): ComparisonEvidenceError {
	return new ComparisonEvidenceError(
		`case ${location.caseId} arm ${location.arm} field ${location.field}: ${message}`,
	);
}

function sha256(bytes: Readonly<Uint8Array>): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function sameValue<Value>(left: Value, right: Value): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function descendantPath(
	request: Readonly<LoadArmRequest>,
	root: string,
	path: string,
	field: string,
): string {
	const absolute = resolve(root, path);
	const descendant = relative(root, absolute);
	if (
		descendant === "" ||
		descendant === ".." ||
		descendant.startsWith(`..${sep}`) ||
		isAbsolute(descendant)
	) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field },
			"evidence path must remain inside its source directory",
		);
	}

	return absolute;
}

async function readEvidenceFile(
	request: Readonly<ReadEvidenceFileRequest>,
): Promise<EvidenceFile> {
	const file = Bun.file(request.path);
	if (!(await file.exists())) {
		throw evidenceError(request, `no file at ${request.path}`);
	}

	const bytes = await file.bytes();

	return {
		canonicalPath: await realpath(request.path),
		sha256: sha256(bytes),
		text: new TextDecoder().decode(bytes),
	};
}

interface LoadArmRequest {
	readonly manifestDirectory: string;
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly groupReference: string;
}

function assertRepMatchesGroup(
	location: Readonly<EvidenceLocation>,
	reference: ParsedConfirmationGroupRecord["repRecords"][number],
	record: Immutable<ParsedConfirmationRepRecord>,
	group: Immutable<ParsedConfirmationGroupRecord>,
): void {
	if (record.groupId !== group.groupId) {
		throw evidenceError(
			{ ...location, field: `${location.field}.groupId` },
			"rep group ID disagrees with its source group",
		);
	}
	if (record.repId !== reference.repId) {
		throw evidenceError(
			{ ...location, field: `${location.field}.repId` },
			"rep ID disagrees with its source group reference",
		);
	}
	if (record.ordinal !== reference.ordinal) {
		throw evidenceError(
			{ ...location, field: `${location.field}.ordinal` },
			"rep ordinal disagrees with its source group reference",
		);
	}
	if (record.mode !== group.mode) {
		throw evidenceError(
			{ ...location, field: `${location.field}.mode` },
			"rep mode disagrees with its source group",
		);
	}
	if (!sameValue(record.lineage, group.inputs.lineage)) {
		throw evidenceError(
			{ ...location, field: `${location.field}.lineage` },
			"rep lineage disagrees with its source group",
		);
	}

	const repStages = record.stages.map(({ stage }) => stage);
	if (!sameValue(repStages, group.declaredStages)) {
		throw evidenceError(
			{ ...location, field: `${location.field}.stages` },
			"rep stages disagree with its source group",
		);
	}
	if (
		(group.mode === "stage" || group.mode === "session") &&
		record.finalOutcome.status !== "NOT_APPLICABLE"
	) {
		throw evidenceError(
			{ ...location, field: `${location.field}.finalOutcome` },
			`${group.mode} rep final outcome must be not applicable`,
		);
	}
	if (
		group.mode === "pipeline" &&
		record.finalOutcome.status === "NOT_APPLICABLE"
	) {
		throw evidenceError(
			{ ...location, field: `${location.field}.finalOutcome` },
			"pipeline rep final outcome cannot be not applicable",
		);
	}
}

interface VerifiedFrozenFiles {
	readonly files: readonly LoadedFrozenFile[];
	readonly sourcePaths: readonly string[];
}

interface SessionFrozenInputs {
	readonly sessionCase: Immutable<SessionCaseDeclaration>;
	readonly files: readonly LoadedFrozenFile[];
	readonly corpusFiles: readonly FrozenFile[];
	readonly sourcePaths: readonly string[];
}

async function assertFrozenFiles(
	request: Readonly<LoadArmRequest>,
	groupPath: string,
	group: Immutable<ParsedConfirmationGroupRecord>,
): Promise<VerifiedFrozenFiles> {
	const identities = new Set<string>();
	const kinds = new Set<FrozenFile["kind"]>();
	const files: LoadedFrozenFile[] = [];
	const sourcePaths: string[] = [];
	for (const frozen of group.inputs.files) {
		const identity = `${frozen.kind}:${frozen.path}`;
		const field = `inputs.files[${identity}]`;
		if (identities.has(identity)) {
			throw evidenceError(
				{ caseId: request.caseId, arm: request.role, field },
				"duplicate frozen input path",
			);
		}

		identities.add(identity);
		kinds.add(frozen.kind);
		if (group.mode === "session") {
			sessionFrozenPath(request, frozen);
		}
		const path =
			group.mode === "session"
				? descendantPath(
						request,
						dirname(groupPath),
						frozen.path,
						`${field}.path`,
					)
				: resolve(dirname(groupPath), frozen.path);
		const source = await readEvidenceFile({
			caseId: request.caseId,
			arm: request.role,
			field: `${field}.path`,
			path,
		});
		if (source.sha256 !== frozen.sha256) {
			throw evidenceError(
				{ caseId: request.caseId, arm: request.role, field: `${field}.sha256` },
				`recorded ${frozen.sha256} but found ${source.sha256}`,
			);
		}

		files.push({ record: frozen, text: source.text });
		sourcePaths.push(source.canonicalPath);
	}

	if (group.mode !== "session") {
		for (const kind of REQUIRED_FROZEN_INPUT_KINDS) {
			if (!kinds.has(kind)) {
				throw evidenceError(
					{
						caseId: request.caseId,
						arm: request.role,
						field: `inputs.files.${kind}`,
					},
					`source group records no ${kind} input`,
				);
			}
		}
	}

	return { files, sourcePaths };
}

function sessionFrozenPath(
	request: Readonly<LoadArmRequest>,
	file: FrozenFile,
): string {
	if (!isSessionFrozenFileKind(file.kind)) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `inputs.files[${file.kind}:${file.path}]`,
			},
			`unsupported session frozen input kind ${file.kind}`,
		);
	}

	const prefix = sessionFrozenPrefix(file.kind);
	const normalized = file.path.replaceAll("\\", "/");
	if (!normalized.startsWith(prefix)) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `inputs.files[${file.kind}:${file.path}]`,
			},
			`session ${file.kind} input must be under ${prefix}`,
		);
	}

	const relativePath = normalized.slice(prefix.length);
	if (
		relativePath.length === 0 ||
		relativePath
			.split("/")
			.some((segment) => segment === "" || segment === "." || segment === "..")
	) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `inputs.files[${file.kind}:${file.path}]`,
			},
			`session ${file.kind} input must name a file under ${prefix}`,
		);
	}

	return relativePath;
}

type SessionFrozenFileKind = "case" | "fixture" | "transcript" | "corpus";

function isSessionFrozenFileKind(
	kind: FrozenFile["kind"],
): kind is SessionFrozenFileKind {
	return (
		kind === "case" ||
		kind === "fixture" ||
		kind === "transcript" ||
		kind === "corpus"
	);
}

function sessionFrozenPrefix(kind: SessionFrozenFileKind): string {
	switch (kind) {
		case "case": {
			return "inputs/";
		}
		case "fixture": {
			return "inputs/fixture/";
		}
		case "transcript": {
			return "inputs/transcript/";
		}
		case "corpus": {
			return "inputs/corpus/";
		}
		default: {
			return unhandled(kind, "session frozen file kind");
		}
	}
}

function sessionCaseFile(
	request: Readonly<LoadArmRequest>,
	files: readonly LoadedFrozenFile[],
): LoadedFrozenFile {
	const caseFiles = files.filter(({ record }) => record.kind === "case");
	if (caseFiles.length !== 1) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: "inputs.files.case" },
			`source group records ${caseFiles.length} case files; expected exactly one`,
		);
	}

	const [caseFile] = caseFiles;
	if (caseFile === undefined) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: "inputs.files.case" },
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
	const caseFile = sessionCaseFile(request, frozen.files);
	let sessionCase: SessionCaseDeclaration;
	try {
		const parsed = parseCaseDeclaration(request.caseId, caseFile.text);
		if (parsed.kind !== "session") {
			throw new Error("frozen case is not a session declaration");
		}
		sessionCase = parsed;
	} catch {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: "inputs.files[case].record",
			},
			"invalid session case declaration",
		);
	}

	const fixtureFiles = frozen.files.filter(
		({ record }) => record.kind === "fixture",
	);
	if (sessionCase.fixture === undefined && fixtureFiles.length > 0) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: "inputs.files.fixture",
			},
			"session case declares no fixture but source group records fixture files",
		);
	}
	const transcriptFiles = frozen.files.filter(
		({ record }) => record.kind === "transcript",
	);
	if (
		(sessionCase.transcript === undefined && transcriptFiles.length > 0) ||
		(sessionCase.transcript !== undefined && transcriptFiles.length !== 1)
	) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
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
					caseId: request.caseId,
					arm: request.role,
					field: "inputs.files.transcript",
				},
				"source group records no transcript file",
			);
		}
		const transcriptPath = sessionFrozenPath(request, transcriptFile.record);
		if (transcriptPath !== basename(sessionCase.transcript.file)) {
			throw evidenceError(
				{
					caseId: request.caseId,
					arm: request.role,
					field: "inputs.files.transcript.path",
				},
				"frozen transcript path disagrees with the session case declaration",
			);
		}
		if (transcriptFile.record.sha256 !== sessionCase.transcript.sha256) {
			throw evidenceError(
				{
					caseId: request.caseId,
					arm: request.role,
					field: "inputs.files.transcript.sha256",
				},
				"frozen transcript digest disagrees with the session case declaration",
			);
		}
	}

	const corpusFiles = frozen.files.filter(
		({ record }) => record.kind === "corpus",
	);
	const frozenCorpusPaths = corpusFiles.map(({ record }) =>
		sessionFrozenPath(request, record),
	);
	const declaredMissing = sessionCase.corpusFiles.some(
		(path) => !frozenCorpusPaths.includes(path),
	);
	const undelivered = frozenCorpusPaths.some(
		(path) => !deliversCorpusFile(sessionCase.corpusFiles, path),
	);
	const duplicated =
		new Set(frozenCorpusPaths).size !== frozenCorpusPaths.length;
	if (declaredMissing || undelivered || duplicated) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: "inputs.files.corpus",
			},
			"frozen corpus paths disagree with the session case declaration",
		);
	}

	if (
		sessionCase.model !== undefined &&
		group.inputs.model !== sessionCase.model
	) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: "inputs.model" },
			`recorded ${group.inputs.model} but the session case declares ${sessionCase.model}`,
		);
	}
	if (
		sessionCase.sessionBudgetUsd !== undefined &&
		group.inputs.sessionBudgetUsd !== sessionCase.sessionBudgetUsd
	) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: "inputs.sessionBudgetUsd",
			},
			"group budget disagrees with the session case declaration",
		);
	}

	return {
		sessionCase,
		files: frozen.files,
		corpusFiles: corpusFiles.map(({ record }) => record),
		sourcePaths: frozen.sourcePaths,
	};
}

type SessionGroupRecord = Extract<
	ParsedConfirmationGroupRecord,
	{ schemaVersion: 2; mode: "session" }
>;
type SessionRepRecord = Extract<
	ParsedConfirmationRepRecord,
	{ schemaVersion: 2; mode: "session" }
>;

function assertSessionAttemptInputs(
	request: Readonly<LoadArmRequest>,
	group: Immutable<SessionGroupRecord>,
	rep: Immutable<SessionRepRecord>,
	attempt: Immutable<SessionAttemptRecord>,
	sessionCase: Immutable<SessionCaseDeclaration>,
	frozenCorpus: readonly FrozenFile[],
	field: string,
): void {
	if (rep.caseId !== sessionCase.id) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.caseId` },
			"rep case ID disagrees with the frozen session case",
		);
	}
	if (attempt.caseId !== sessionCase.id) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.caseId` },
			"attempt case ID disagrees with the frozen session case",
		);
	}
	if (
		attempt.lineage !== rep.lineage.lineage ||
		attempt.lineage !== group.inputs.lineage.lineage
	) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.lineage` },
			"attempt lineage disagrees with its rep and source group",
		);
	}
	if (attempt.model !== group.inputs.model) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.model` },
			"attempt model disagrees with the frozen session inputs",
		);
	}
	if (sessionCase.model !== undefined && attempt.model !== sessionCase.model) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.model` },
			"attempt model disagrees with the frozen session case",
		);
	}
	if (attempt.effort !== group.inputs.effort) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.effort` },
			"attempt effort disagrees with the frozen session inputs",
		);
	}
	if (attempt.sessionBudgetUsd !== group.inputs.sessionBudgetUsd) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `${field}.sessionBudgetUsd`,
			},
			"attempt budget disagrees with the frozen session inputs",
		);
	}
	if (attempt.prompt !== sessionCase.prompt) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.prompt` },
			"attempt prompt disagrees with the frozen session case",
		);
	}

	const expectedCorpus = frozenCorpus
		.map((file) => ({
			path: sessionFrozenPath(request, file),
			sha256: file.sha256,
		}))
		.filter(({ path }) => sessionCase.corpusFiles.includes(path))
		.toSorted((left, right) => left.path.localeCompare(right.path));
	const actualCorpus = attempt.corpusFiles
		.map(({ path: corpusPath, sha256: fileSha256 }) => ({
			path: corpusPath,
			sha256: fileSha256,
		}))
		.toSorted((left, right) => left.path.localeCompare(right.path));
	if (!sameValue(expectedCorpus, actualCorpus)) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `${field}.corpusFiles`,
			},
			"attempt corpus files disagree with the frozen session inputs",
		);
	}
}

function assertSessionAttemptChecks(
	request: Readonly<LoadArmRequest>,
	attempt: Immutable<SessionAttemptRecord>,
	rep: Immutable<SessionRepRecord>,
	sessionCase: Immutable<SessionCaseDeclaration>,
	field: string,
): void {
	assertSessionAttemptTiming(request, attempt, rep, field);
	const [checks] = rep.stages;
	const failedChecksStatus = sessionFailedChecksStatus(attempt.outcome);
	if (failedChecksStatus !== undefined) {
		if (attempt.checks.length > 0) {
			throw evidenceError(
				{
					caseId: request.caseId,
					arm: request.role,
					field: `${field}.checks`,
				},
				"an attempt without a checked reply must record no checks",
			);
		}
		return;
	}
	if (attempt.checks.length !== sessionCase.checks.length) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.checks` },
			"attempt check count disagrees with the frozen session case",
		);
	}
	for (const [index, check] of attempt.checks.entries()) {
		if (check.kind !== sessionCase.checks[index]?.kind) {
			throw evidenceError(
				{
					caseId: request.caseId,
					arm: request.role,
					field: `${field}.checks[${index}].kind`,
				},
				"attempt check kind disagrees with the frozen session case",
			);
		}
	}
	if (attempt.metrics === undefined && checks?.status !== "METRICS_MISSING") {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.outcome` },
			"a checked attempt without metrics must map to a metrics-missing checks outcome",
		);
	}
	if (
		attempt.metrics !== undefined &&
		(checks?.status !== "JUDGED" ||
			checks.verdict !==
				(attempt.outcome === "SUCCESSFUL" ? "CONTINUE" : "STOP") ||
			checks.grade !== (attempt.outcome === "SUCCESSFUL" ? "A" : "F"))
	) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.outcome` },
			"checked attempt outcome disagrees with its recorded checks result",
		);
	}
}

function sessionFailedChecksStatus(
	outcome: SessionAttemptRecord["outcome"],
): "NOT_REACHED" | "EXECUTION_FAILED" | undefined {
	switch (outcome) {
		case "NO_REPLY": {
			return "NOT_REACHED";
		}
		case "EXECUTION_FAILED": {
			return "EXECUTION_FAILED";
		}
		case "SUCCESSFUL": {
			return undefined;
		}
		case "UNSUCCESSFUL": {
			return undefined;
		}
		default: {
			return unhandled(outcome, "session attempt outcome");
		}
	}
}

function assertSessionAttemptTiming(
	request: Readonly<LoadArmRequest>,
	attempt: Immutable<SessionAttemptRecord>,
	rep: Immutable<SessionRepRecord>,
	field: string,
): void {
	if (rep.elapsedMs !== attempt.elapsedMs) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `${field}.elapsedMs`,
			},
			"rep elapsed time disagrees with its recorded attempt",
		);
	}
	const [checks] = rep.stages;
	if (
		checks !== undefined &&
		"elapsedMs" in checks &&
		checks.elapsedMs !== undefined &&
		checks.elapsedMs !== attempt.elapsedMs
	) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `${field}.elapsedMs`,
			},
			"checks elapsed time disagrees with its recorded attempt",
		);
	}
}

function assertSessionAttemptMetrics(
	request: Readonly<LoadArmRequest>,
	attempt: Immutable<SessionAttemptRecord>,
	rep: Immutable<SessionRepRecord>,
	field: string,
): void {
	if (attempt.metrics === undefined) {
		if (rep.metrics.status !== "MISSING") {
			throw evidenceError(
				{
					caseId: request.caseId,
					arm: request.role,
					field: `${field}.metrics`,
				},
				"rep records complete metrics for an attempt with missing metrics",
			);
		}
		if (rep.metrics.calls.length > 0 || rep.workerTrajectorySteps !== 0) {
			throw evidenceError(
				{
					caseId: request.caseId,
					arm: request.role,
					field: `${field}.metrics`,
				},
				"rep metrics disagree with its attempt's missing metrics",
			);
		}

		return;
	}
	if (rep.metrics.status !== "COMPLETE") {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.metrics` },
			"rep records missing metrics for an attempt with metrics",
		);
	}
	const [workerCall] = rep.metrics.calls;
	if (
		rep.metrics.calls.length !== 1 ||
		workerCall?.role !== "worker" ||
		!sameValue(workerCall.metrics, attempt.metrics) ||
		rep.workerTrajectorySteps !== attempt.metrics.turns
	) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.metrics` },
			"rep metrics disagree with its recorded attempt",
		);
	}
}

function assertSessionAttemptAggregate(
	request: Readonly<LoadArmRequest>,
	attempt: Immutable<SessionAttemptRecord>,
	rep: Immutable<SessionRepRecord>,
	field: string,
): void {
	const [checks] = rep.stages;
	const expectedOutcome =
		attempt.outcome === "SUCCESSFUL" && attempt.metrics !== undefined
			? "SUCCESSFUL"
			: "UNSUCCESSFUL";
	if (rep.outcome !== expectedOutcome) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.outcome` },
			"rep outcome disagrees with its recorded attempt",
		);
	}
	assertSessionAttemptMetrics(request, attempt, rep, field);
	const failedChecksStatus = sessionFailedChecksStatus(attempt.outcome);
	if (
		failedChecksStatus !== undefined &&
		checks?.status !== failedChecksStatus
	) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: `${field}.outcome` },
			failedChecksStatus === "NOT_REACHED"
				? "no-reply attempt must map to a not-reached checks outcome"
				: "failed invocation must map to an execution-failed checks outcome",
		);
	}
}

function assertSessionAttempt(
	request: Readonly<LoadArmRequest>,
	group: Immutable<SessionGroupRecord>,
	rep: Immutable<SessionRepRecord>,
	attempt: Immutable<SessionAttemptRecord>,
	sessionCase: Immutable<SessionCaseDeclaration>,
	frozenCorpus: readonly FrozenFile[],
	field: string,
): void {
	assertSessionAttemptInputs(
		request,
		group,
		rep,
		attempt,
		sessionCase,
		frozenCorpus,
		field,
	);
	assertSessionAttemptChecks(request, attempt, rep, sessionCase, field);
	assertSessionAttemptAggregate(request, attempt, rep, field);
}

interface LoadSessionRepRequest {
	readonly request: Readonly<LoadArmRequest>;
	readonly group: Immutable<SessionGroupRecord>;
	readonly reference: Immutable<SessionGroupRecord["repRecords"][number]>;
	readonly record: Immutable<SessionRepRecord>;
	readonly source: Readonly<EvidenceFile>;
	readonly sessionCase: Immutable<SessionCaseDeclaration>;
	readonly frozenCorpus: readonly FrozenFile[];
	readonly field: string;
	readonly path: string;
}

async function loadSessionRep(
	input: Readonly<LoadSessionRepRequest>,
): Promise<DigestedComparisonRep> {
	const { request, group, reference, record, source, sessionCase } = input;
	const { field, frozenCorpus, path } = input;
	assertRepMatchesGroup(
		{ caseId: request.caseId, arm: request.role, field },
		reference,
		record,
		group,
	);
	const evidence = record.stages[0]?.evidence;
	if (evidence === undefined) {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `${field}.evidence`,
			},
			"session rep has no attempt evidence",
		);
	}
	if (evidence.recordFile !== "attempt.json") {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `${field}.attempt.path`,
			},
			"session attempt evidence must be the producer's attempt.json file",
		);
	}
	const attemptPath = descendantPath(
		request,
		dirname(path),
		evidence.recordFile,
		`${field}.attempt.path`,
	);
	const attemptSource = await readEvidenceFile({
		caseId: request.caseId,
		arm: request.role,
		field: `${field}.attempt.path`,
		path: attemptPath,
	});
	let attempt: SessionAttemptRecord;
	try {
		attempt = parseSessionAttemptRecord(attemptSource.text);
	} catch {
		throw evidenceError(
			{
				caseId: request.caseId,
				arm: request.role,
				field: `${field}.attempt.record`,
			},
			"invalid session attempt record",
		);
	}
	assertSessionAttempt(
		request,
		group,
		record,
		attempt,
		sessionCase,
		frozenCorpus,
		field,
	);

	return {
		path: relative(request.manifestDirectory, path),
		sha256: source.sha256,
		record,
		canonicalPath: source.canonicalPath,
		attempt: {
			path: relative(request.manifestDirectory, attemptPath),
			sha256: attemptSource.sha256,
			record: attempt,
			canonicalPath: attemptSource.canonicalPath,
		},
	};
}

function parsedScorecard(text: string): StageGradingRecord | undefined {
	try {
		return stageGradingRecordSchema.parse(JSON.parse(text));
	} catch {
		return undefined;
	}
}

/**
 * A judged stage's scorecard holds the blockers and dimensions What moved
 * reads, so a stage comparison hashes it as source evidence like the rep.
 */
async function loadStageScorecards(
	request: Readonly<LoadArmRequest>,
	record: Immutable<ParsedConfirmationRepRecord>,
	repPath: string,
	field: string,
): Promise<readonly DigestedRecord<StageGradingRecord>[]> {
	const scorecards: DigestedRecord<StageGradingRecord>[] = [];
	for (const [index, stage] of record.stages.entries()) {
		if (stage.status !== "JUDGED") {
			continue;
		}

		const stageField = `${field}.stages[${index}].evidence.recordFile`;
		const scorecardPath = descendantPath(
			request,
			dirname(repPath),
			stage.evidence.recordFile,
			stageField,
		);
		const scorecardSource = await readEvidenceFile({
			caseId: request.caseId,
			arm: request.role,
			field: stageField,
			path: scorecardPath,
		});
		const parsed = parsedScorecard(scorecardSource.text);
		if (parsed?.stage !== stage.stage) {
			throw evidenceError(
				{ caseId: request.caseId, arm: request.role, field: stageField },
				`invalid stage scorecard for ${stage.stage}`,
			);
		}
		scorecards.push({
			path: relative(request.manifestDirectory, scorecardPath),
			sha256: scorecardSource.sha256,
			record: parsed,
			canonicalPath: scorecardSource.canonicalPath,
		});
	}

	return scorecards;
}

async function loadRepRecords(
	request: Readonly<LoadArmRequest>,
	groupPath: string,
	group: Immutable<ParsedConfirmationGroupRecord>,
	sessionCase: Immutable<SessionCaseDeclaration> | undefined,
	frozenCorpus: readonly FrozenFile[],
): Promise<readonly DigestedComparisonRep[]> {
	const reps: DigestedComparisonRep[] = [];
	for (const [index, reference] of group.repRecords.entries()) {
		const field = `repRecords[${index}]`;
		const path =
			group.mode === "session"
				? descendantPath(
						request,
						dirname(groupPath),
						reference.path,
						`${field}.path`,
					)
				: resolve(dirname(groupPath), reference.path);
		const source = await readEvidenceFile({
			caseId: request.caseId,
			arm: request.role,
			field: `${field}.path`,
			path,
		});
		let record: ParsedConfirmationRepRecord;
		try {
			record = parseConfirmationRepRecord(source.text);
		} catch {
			throw evidenceError(
				{ caseId: request.caseId, arm: request.role, field: `${field}.record` },
				"invalid confirmation rep record",
			);
		}
		if (group.mode === "session") {
			if (group.schemaVersion !== 2) {
				throw evidenceError(
					{ caseId: request.caseId, arm: request.role, field: `${field}.mode` },
					"legacy session confirmation groups are not comparable; rerun with session evidence",
				);
			}
			if (record.schemaVersion !== 2 || record.mode !== "session") {
				throw evidenceError(
					{ caseId: request.caseId, arm: request.role, field: `${field}.mode` },
					"session comparison requires a version-2 session rep",
				);
			}
			if (sessionCase === undefined) {
				throw evidenceError(
					{
						caseId: request.caseId,
						arm: request.role,
						field: `${field}.case`,
					},
					"session rep has no frozen session case declaration",
				);
			}
			reps.push(
				await loadSessionRep({
					request,
					group,
					reference,
					record,
					source,
					sessionCase,
					frozenCorpus,
					field,
					path,
				}),
			);
			continue;
		}

		assertRepMatchesGroup(
			{ caseId: request.caseId, arm: request.role, field },
			reference,
			record,
			group,
		);
		const digested = {
			path: relative(request.manifestDirectory, path),
			sha256: source.sha256,
			record,
			canonicalPath: source.canonicalPath,
		};
		reps.push(
			group.mode === "stage" || group.mode === "pipeline"
				? {
						...digested,
						scorecards: await loadStageScorecards(request, record, path, field),
					}
				: digested,
		);
	}

	return reps;
}

async function loadArm(
	request: Readonly<LoadArmRequest>,
): Promise<LoadedComparisonArmEvidence> {
	const groupPath = resolve(request.manifestDirectory, request.groupReference);
	const source = await readEvidenceFile({
		caseId: request.caseId,
		arm: request.role,
		field: "group.path",
		path: groupPath,
	});
	let declared: DeclaredConfirmationGroup;
	try {
		declared = parseDeclaredConfirmationGroup(source.text);
	} catch {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: "group.record" },
			"invalid confirmation group record",
		);
	}

	const group = declared.record;
	if (group.mode === "session" && group.schemaVersion !== 2) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: "group.mode" },
			"legacy session confirmation groups are not comparable; rerun with session evidence",
		);
	}
	const frozen = await assertFrozenFiles(request, groupPath, group);
	let session: SessionFrozenInputs | undefined;
	if (group.mode === "session") {
		session = assertSessionFrozenFiles(request, group, frozen);
	}
	const reps = await loadRepRecords(
		request,
		groupPath,
		group,
		session?.sessionCase,
		session?.corpusFiles ?? [],
	);

	const loaded = {
		role: request.role,
		declaredCaseId: declared.declaredCaseId,
		group: {
			path: relative(request.manifestDirectory, groupPath),
			sha256: source.sha256,
			record: group,
			canonicalPath: source.canonicalPath,
		},
		reps,
		frozenFiles: frozen.files,
		sourcePaths: [
			source.canonicalPath,
			...reps.flatMap(({ attempt, scorecards, canonicalPath, path }) => {
				const paths = [
					canonicalPath ?? resolve(request.manifestDirectory, path),
				];
				if (attempt?.canonicalPath !== undefined) {
					paths.push(attempt.canonicalPath);
				}
				for (const scorecard of scorecards ?? []) {
					if (scorecard.canonicalPath !== undefined) {
						paths.push(scorecard.canonicalPath);
					}
				}

				return paths;
			}),
			...frozen.sourcePaths,
		],
	};
	if (session === undefined) {
		return loaded;
	}

	return { ...loaded, sessionCase: session.sessionCase };
}

async function loadArmGroups(
	request: Readonly<Omit<LoadArmRequest, "groupReference">>,
	groupReferences: ComparisonManifest["cases"][number]["arms"][ComparisonArm],
): Promise<LoadedComparisonArmGroups> {
	const [first, ...rest] = groupReferences;
	if (first === undefined) {
		throw evidenceError(
			{ caseId: request.caseId, arm: request.role, field: "group.path" },
			"the arm names no confirmation group",
		);
	}
	const groups: [
		LoadedComparisonArmEvidence,
		...LoadedComparisonArmEvidence[],
	] = [await loadArm({ ...request, groupReference: first })];
	for (const groupReference of rest) {
		groups.push(await loadArm({ ...request, groupReference }));
	}

	return groups;
}

async function loadCase(
	manifestDirectory: string,
	benchmarkCase: ComparisonManifest["cases"][number],
): Promise<LoadedComparisonCaseEvidence> {
	const armGroups = (role: ComparisonArm): Promise<LoadedComparisonArmGroups> =>
		loadArmGroups(
			{ manifestDirectory, caseId: benchmarkCase.caseId, role },
			benchmarkCase.arms[role],
		);

	return {
		caseId: benchmarkCase.caseId,
		arms: {
			baseline: await armGroups("baseline"),
			candidate: await armGroups("candidate"),
			control: await armGroups("control"),
		},
	};
}

export async function loadComparisonEvidence(
	manifestPath: string,
): Promise<ComparisonEvidence> {
	const absoluteManifestPath = resolve(manifestPath);
	const source = await readEvidenceFile({
		caseId: "manifest",
		arm: "all",
		field: "manifest.path",
		path: absoluteManifestPath,
	});
	const manifest = parseComparisonManifest(source.text);
	const manifestDirectory = dirname(absoluteManifestPath);
	const loadedCases: LoadedComparisonCaseEvidence[] = [];
	for (const benchmarkCase of manifest.cases) {
		loadedCases.push(await loadCase(manifestDirectory, benchmarkCase));
	}

	const { cases, contract } = buildComparableComparison(loadedCases);

	return {
		manifest: { path: absoluteManifestPath, sha256: source.sha256 },
		cases,
		contract,
		sourcePaths: [
			source.canonicalPath,
			...loadedCases.flatMap(({ arms }) =>
				COMPARISON_ARMS.flatMap((role) =>
					arms[role].flatMap(({ sourcePaths }) => sourcePaths),
				),
			),
		],
	};
}
