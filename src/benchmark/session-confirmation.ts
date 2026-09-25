import { cp, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { SessionCase } from "./case";
import type { SessionSettings } from "./claude";
import type { ConfirmationCostProjection } from "./confirmation";
import { runConfirmation } from "./confirmation";
import type { Immutable } from "./contracts";
import type { ResolvedCorpusFile } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { hashCorpusFiles } from "./corpus-file";
import { resolveCorpusSource } from "./corpus-source";
import { measureCorpusVersion } from "./corpus-version";
import type { CorpusSourceResolver } from "./corpus-source";
import type { SessionConfirmationRepRecord } from "./confirmation-record";
import { sessionConfirmationRepRecordSchema } from "./confirmation-record";
import {
	finalizeConfirmationGroup,
	frozenDirectoryFiles,
	writeFrozenFile,
} from "./confirmation-evidence";
import type {
	ConfirmationGroupOutcome,
	FrozenFile,
} from "./confirmation-evidence";
import { confirmationGroupPaths } from "./run-layout";
import type { ModelPreflightEvidence } from "./preflight";
import type { SessionAttempt } from "./session-attempt";
import { SessionInvocationError } from "./session-invocation-error";
import type { SessionCorpusSnapshot } from "./session-corpus";
import { freezeSessionCorpus } from "./session-corpus";
import { sessionLineage } from "./session-lineage";
import { buildSessionAttemptRecord } from "./session-record";
import { claimShortId } from "./short-id";

export { SessionInvocationError } from "./session-invocation-error";

export interface SessionConfirmationRequest {
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly reps: number;
	readonly projectedCost: ConfirmationCostProjection & {
		readonly preflightMaximumUsd: number;
	};
	readonly approvalMethod: "interactive" | "yes";
	readonly sessionCase: SessionCase;
	readonly corpus?: string | undefined;
	readonly model: string;
	readonly effort?: SessionSettings["effort"] | undefined;
	readonly sessionBudgetUsd: number;
	readonly preflight: ModelPreflightEvidence;
}

export interface SessionConfirmationRepPlan {
	readonly ordinal: number;
	readonly repId: string;
	readonly recordDirectory: string;
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly corpusSnapshot: SessionCorpusSnapshot;
	readonly corpusFiles: readonly ResolvedCorpusFile[];
	readonly lineage: string;
}

export interface SessionConfirmationDependencies {
	readonly executeAttempt: (
		plan: Immutable<SessionConfirmationRepPlan>,
	) => Promise<SessionAttempt>;
	readonly now?: (() => number) | undefined;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
}

interface FrozenSessionInputs {
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly corpusSnapshot: SessionCorpusSnapshot;
	readonly corpusFiles: readonly ResolvedCorpusFile[];
	readonly corpusVersion: CorpusMeasurement;
	readonly lineage: string;
	readonly files: readonly FrozenFile[];
}

async function freezeInputs(
	request: SessionConfirmationRequest,
	groupDirectory: string,
	inputsDirectory: string,
	resolveCorpus: CorpusSourceResolver = resolveCorpusSource,
): Promise<FrozenSessionInputs> {
	await mkdir(inputsDirectory, { recursive: true });
	const source = await resolveCorpus(request.corpus);
	const corpusVersion = await measureCorpusVersion(
		request.runsDirectory,
		source,
	);
	const corpusDirectory = join(inputsDirectory, "corpus");
	const corpusSnapshot = await freezeSessionCorpus(
		source,
		corpusDirectory,
		request.sessionCase.corpusFiles,
	);
	const corpusFiles = await hashCorpusFiles(
		corpusSnapshot,
		request.sessionCase.corpusFiles,
	);
	const files: FrozenSessionInputs["files"][number][] = [
		await writeFrozenFile(
			groupDirectory,
			join(inputsDirectory, "case.json"),
			`${JSON.stringify(request.sessionCase.declaration, null, 2)}\n`,
			"case",
		),
	];

	let fixturePath: string | undefined;
	if (request.sessionCase.fixturePath !== undefined) {
		fixturePath = join(inputsDirectory, "fixture");
		await cp(request.sessionCase.fixturePath, fixturePath, { recursive: true });
		files.push(
			...(await frozenDirectoryFiles(groupDirectory, fixturePath, "fixture")),
		);
	}

	let transcriptPath: string | undefined;
	if (request.sessionCase.transcriptPath !== undefined) {
		transcriptPath = join(
			inputsDirectory,
			"transcript",
			basename(request.sessionCase.transcriptPath),
		);
		files.push(
			await writeFrozenFile(
				groupDirectory,
				transcriptPath,
				await Bun.file(request.sessionCase.transcriptPath).text(),
				"transcript",
			),
		);
	}

	files.push(
		...(await frozenDirectoryFiles(groupDirectory, corpusDirectory, "corpus")),
	);
	const sessionCase: SessionCase = {
		...request.sessionCase,
		fixturePath,
		transcriptPath,
	};
	const settings: SessionSettings = {
		model: request.model,
		effort: request.effort,
		budgetUsd: request.sessionBudgetUsd,
	};
	const lineage = await sessionLineage(sessionCase, corpusFiles, settings);

	return {
		sessionCase,
		settings,
		corpusSnapshot,
		corpusFiles,
		corpusVersion,
		lineage,
		files,
	};
}

function repRecord(
	request: SessionConfirmationRequest,
	inputs: FrozenSessionInputs,
	plan: { readonly ordinal: number; readonly repId: string },
	attempt: SessionAttempt,
	error: string | undefined,
	elapsedMs: number,
): SessionConfirmationRepRecord {
	const evidence = { recordFile: "attempt.json" };
	const metrics =
		attempt.metrics === undefined
			? {
					status: "MISSING" as const,
					calls: [],
					missing: ["worker call metrics"],
				}
			: {
					status: "COMPLETE" as const,
					calls: [{ role: "worker" as const, metrics: attempt.metrics }],
				};
	let stage: SessionConfirmationRepRecord["stages"][number];
	if (attempt.outcome === "EXECUTION_FAILED") {
		stage = {
			stage: "checks",
			status: "EXECUTION_FAILED",
			elapsedMs,
			error: error ?? "Session invocation failed",
			evidence,
		};
	} else if (attempt.outcome === "NO_REPLY") {
		stage = {
			stage: "checks",
			status: "NOT_REACHED",
			reason: "The session produced no reply",
			evidence,
		};
	} else if (attempt.metrics === undefined) {
		stage = {
			stage: "checks",
			status: "METRICS_MISSING",
			elapsedMs,
			error: "Worker call metrics are missing",
			evidence,
		};
	} else {
		const passed = attempt.outcome === "SUCCESSFUL";
		stage = passed
			? {
					stage: "checks",
					status: "JUDGED",
					grade: "A",
					verdict: "CONTINUE",
					elapsedMs,
					evidence,
				}
			: {
					stage: "checks",
					status: "JUDGED",
					grade: "F",
					verdict: "STOP",
					elapsedMs,
					evidence,
				};
	}

	return sessionConfirmationRepRecordSchema.parse({
		schemaVersion: 2,
		caseId: request.sessionCase.declaration.id,
		groupId: request.groupId,
		repId: plan.repId,
		ordinal: plan.ordinal,
		mode: "session",
		lineage: { kind: "SESSION", lineage: inputs.lineage },
		outcome:
			attempt.outcome === "SUCCESSFUL" && attempt.metrics !== undefined
				? "SUCCESSFUL"
				: "UNSUCCESSFUL",
		stages: [stage],
		finalOutcome: { status: "NOT_APPLICABLE" },
		metrics,
		workerTrajectorySteps: attempt.metrics?.turns ?? 0,
		elapsedMs,
	});
}

interface ExecutedRep {
	readonly attempt: SessionAttempt;
	readonly error: string | undefined;
	readonly elapsedMs: number;
}

export async function runSessionConfirmation(
	dependencies: SessionConfirmationDependencies,
	request: SessionConfirmationRequest,
): Promise<ConfirmationGroupOutcome> {
	const now = dependencies.now ?? Date.now;
	const paths = confirmationGroupPaths(request.runsDirectory, request.groupId);
	const inputs = await freezeInputs(
		request,
		paths.directory,
		paths.inputsDirectory,
		dependencies.resolveCorpus,
	);
	await claimShortId(
		request.runsDirectory,
		request.sessionCase.declaration.id,
		{ kind: "group", groupId: request.groupId },
	);
	const startedAt = now();
	const results = await runConfirmation<FrozenSessionInputs, ExecutedRep>(
		{
			groupId: request.groupId,
			reps: request.reps,
			frozenInputs: inputs,
			worktreePath: (repId) => join(paths.rep(repId).directory, "execution"),
		},
		async (plan) => {
			const repStartedAt = now();
			const recordDirectory = paths.rep(plan.repId).directory;
			try {
				return {
					attempt: await dependencies.executeAttempt({
						ordinal: plan.ordinal,
						repId: plan.repId,
						recordDirectory,
						sessionCase: inputs.sessionCase,
						settings: inputs.settings,
						corpusSnapshot: inputs.corpusSnapshot,
						corpusFiles: inputs.corpusFiles,
						lineage: inputs.lineage,
					}),
					error: undefined,
					elapsedMs: now() - repStartedAt,
				};
			} catch (error) {
				if (!(error instanceof SessionInvocationError)) {
					throw error;
				}

				return {
					attempt: error.attempt,
					error: error.message,
					elapsedMs: now() - repStartedAt,
				};
			}
		},
	);
	const repResults = [];
	for (const result of results) {
		if (result.outcome.status === "rejected") {
			throw result.outcome.reason;
		}

		const executed = result.outcome.value;
		const { repId } = result.plan;
		const recordDirectory = paths.rep(repId).directory;
		await mkdir(recordDirectory, { recursive: true });
		const attemptFile = join(recordDirectory, "attempt.json");
		await Bun.write(
			attemptFile,
			`${JSON.stringify(
				buildSessionAttemptRecord({
					sessionCase: inputs.sessionCase,
					settings: inputs.settings,
					lineage: inputs.lineage,
					corpusFiles: inputs.corpusFiles,
					corpusOrigin: inputs.corpusSnapshot.origin,
					corpusVersion: inputs.corpusVersion,
					attempt: executed.attempt,
					error: executed.error,
					elapsedMs: executed.elapsedMs,
				}),
				null,
				2,
			)}\n`,
		);
		const record = repRecord(
			request,
			inputs,
			result.plan,
			executed.attempt,
			executed.error,
			executed.elapsedMs,
		);
		const { recordFile } = paths.rep(repId);
		await Bun.write(recordFile, `${JSON.stringify(record, null, 2)}\n`);
		repResults.push({ recordFile, preservedWorktree: false });
	}

	return finalizeConfirmationGroup({
		mode: "session",
		caseId: request.sessionCase.declaration.id,
		groupId: request.groupId,
		reps: request.reps,
		declaredStages: ["checks"],
		inputs: {
			lineage: { kind: "SESSION", lineage: inputs.lineage },
			files: inputs.files,
			corpusVersion: inputs.corpusVersion,
			model: request.model,
			effort: request.effort,
			sessionBudgetUsd: request.sessionBudgetUsd,
		},
		projectedCost: request.projectedCost,
		preflight:
			request.preflight.status === "COMPLETE"
				? {
						status: "COMPLETE",
						call: { role: "worker", metrics: request.preflight.call.metrics },
					}
				: request.preflight,
		approvalMethod: request.approvalMethod,
		repResults,
		worktreesDirectory: join(paths.directory, "worktrees"),
		groupDirectory: paths.directory,
		runsDirectory: request.runsDirectory,
		groupFile: paths.groupFile,
		reportFile: paths.reportFile,
		makespanMs: now() - startedAt,
	});
}
