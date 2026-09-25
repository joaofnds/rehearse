import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ConfirmationCostProjection } from "./confirmation";
import type { Effort } from "./config";
import type { CorpusMeasurement } from "./corpus-measurement";
import {
	filterJudgeAgreementReport,
	loadJudgeAgreementReport,
} from "./judge-agreement";
import type { ClaudeCallMetrics, Immutable, ProviderCall } from "./contracts";
import type {
	ConfirmationGroupRecord,
	ConfirmationRepRecord,
	SessionConfirmationGroupRecord,
} from "./confirmation-record";
import {
	confirmationGroupRecordSchema,
	parseConfirmationRepRecord,
	sessionConfirmationGroupRecordSchema,
} from "./confirmation-record";
import {
	buildReliabilityReport,
	buildResourceReport,
	buildSessionCommandTotal,
} from "./confirmation-report";

export interface FrozenFile {
	readonly kind:
		| ConfirmationGroupRecord["inputs"]["files"][number]["kind"]
		| SessionConfirmationGroupRecord["inputs"]["files"][number]["kind"];
	readonly path: string;
	readonly sha256: string;
}

export async function writeFrozenFile(
	groupDirectory: string,
	path: string,
	content: string,
	kind: FrozenFile["kind"],
): Promise<FrozenFile> {
	await Bun.write(path, content);

	return {
		kind,
		path: relative(groupDirectory, path),
		sha256: createHash("sha256").update(content).digest("hex"),
	};
}

export async function frozenDirectoryFiles(
	groupDirectory: string,
	directory: string,
	kind: FrozenFile["kind"],
): Promise<readonly FrozenFile[]> {
	const files: FrozenFile[] = [];
	const entries = await readdir(directory, { recursive: true });
	for (const entry of entries.toSorted()) {
		const path = join(directory, entry);
		const file = Bun.file(path);
		if (!(await file.exists()) || file.type === "directory") {
			continue;
		}

		const bytes = await file.bytes();
		files.push({
			kind,
			path: relative(groupDirectory, path),
			sha256: createHash("sha256").update(bytes).digest("hex"),
		});
	}

	return files;
}

export interface ConfirmationRepResult {
	readonly recordFile: string;
	readonly preservedWorktree: boolean;
}

interface CompletedConfirmationRep {
	readonly targetRoot: string;
	readonly retentionName: string;
	readonly resultSha: string;
	readonly recordFile: string;
	readonly recordContent: string;
	readonly worktreePath: string;
	readonly recordRetentionRef: (
		targetRoot: string,
		retentionName: string,
		resultSha: string,
	) => Promise<void>;
	readonly removeWorktree: (
		targetRoot: string,
		worktreePath: string,
	) => Promise<void>;
}

export async function settleCompletedConfirmationRep(
	rep: Readonly<CompletedConfirmationRep>,
): Promise<ConfirmationRepResult> {
	await rep.recordRetentionRef(
		rep.targetRoot,
		rep.retentionName,
		rep.resultSha,
	);
	await Bun.write(rep.recordFile, rep.recordContent);
	await rep.removeWorktree(rep.targetRoot, rep.worktreePath);

	return { recordFile: rep.recordFile, preservedWorktree: false };
}

interface DiagnosticConfirmationRep {
	readonly recordFile: string;
	readonly recordContent: string;
	readonly worktreeCreated: boolean;
	readonly preservedMessage: string;
	readonly log: (message: string) => void;
}

export async function settleDiagnosticConfirmationRep(
	rep: Readonly<DiagnosticConfirmationRep>,
): Promise<ConfirmationRepResult> {
	await Bun.write(rep.recordFile, rep.recordContent);
	if (rep.worktreeCreated) {
		rep.log(rep.preservedMessage);
	}

	return {
		recordFile: rep.recordFile,
		preservedWorktree: rep.worktreeCreated,
	};
}

interface ConfirmationGroupFinalizationBase {
	readonly caseId: string;
	readonly groupId: string;
	readonly reps: number;
	readonly declaredStages: readonly string[];
	readonly approvalMethod: "interactive" | "yes";
	readonly repResults: readonly ConfirmationRepResult[];
	readonly worktreesDirectory: string;
	readonly groupDirectory: string;
	readonly runsDirectory: string;
	readonly groupFile: string;
	readonly reportFile: string;
	readonly makespanMs: number;
}

type ConfirmationGroupLineage =
	| { readonly kind: "SOURCE"; readonly sha: string }
	| {
			readonly kind: "CHECKPOINT";
			readonly lineage: string;
			readonly targetSha: string;
	  };

interface ConfirmationGroupInputs {
	readonly lineage: ConfirmationGroupLineage;
	readonly files: readonly Readonly<FrozenFile>[];
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly pipelinePath: string;
	readonly corpusVersion?: CorpusMeasurement | undefined;
}

interface SessionConfirmationGroupInputs {
	readonly lineage: { readonly kind: "SESSION"; readonly lineage: string };
	readonly files: readonly Readonly<FrozenFile>[];
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly corpusVersion?: CorpusMeasurement | undefined;
}

type ConfirmationGroupFinalization = ConfirmationGroupFinalizationBase &
	(
		| {
				readonly mode: "stage" | "pipeline";
				readonly inputs: ConfirmationGroupInputs;
				readonly projectedCost: ConfirmationCostProjection;
				readonly preflight?: never;
		  }
		| {
				readonly mode: "session";
				readonly inputs: SessionConfirmationGroupInputs;
				readonly projectedCost: ConfirmationCostProjection & {
					readonly preflightMaximumUsd: number;
				};
				readonly preflight: SessionConfirmationGroupRecord["preflight"];
		  }
	);

export interface ConfirmationGroupOutcome {
	readonly groupRecordFile: string;
	readonly reportFile: string;
	readonly repRecordFiles: readonly string[];
}

export async function finalizeConfirmationGroup(
	finalization: Immutable<ConfirmationGroupFinalization>,
): Promise<ConfirmationGroupOutcome> {
	const repRecordFiles = finalization.repResults.map(
		({ recordFile }) => recordFile,
	);
	const records = await Promise.all(
		repRecordFiles.map(async (path) =>
			parseConfirmationRepRecord(await Bun.file(path).text()),
		),
	);
	const reliabilityInputs = records.map((record) => {
		if (finalization.mode === "stage" || finalization.mode === "session") {
			return {
				metricsComplete: record.metrics.status === "COMPLETE",
				stages: record.stages,
				finalOutcome: { status: "NOT_REACHED" as const },
			};
		}
		if (record.finalOutcome.status === "NOT_APPLICABLE") {
			throw new Error(
				"Pipeline rep cannot have a not-applicable final outcome",
			);
		}

		return {
			metricsComplete: record.metrics.status === "COMPLETE",
			stages: record.stages,
			finalOutcome: record.finalOutcome,
		};
	});
	const reliability = buildReliabilityReport(
		finalization.declaredStages,
		reliabilityInputs,
	);
	const resources = buildResourceReport(
		finalization.declaredStages,
		records,
		finalization.makespanMs,
	);
	const sessionResources =
		finalization.mode === "session"
			? {
					...resources,
					commandTotal: buildSessionCommandTotal(
						resources,
						finalization.preflight.status === "COMPLETE"
							? {
									status: "COMPLETE",
									metrics: finalization.preflight.call.metrics,
								}
							: {
									status: "MISSING",
									missing: finalization.preflight.missing,
								},
					),
				}
			: resources;
	const commonReport = {
		reliability:
			finalization.mode === "stage" || finalization.mode === "session"
				? reliability.slice(0, finalization.declaredStages.length)
				: reliability,
		resources: sessionResources,
	};
	const report =
		finalization.mode === "session"
			? commonReport
			: {
					...commonReport,
					judgeAgreement: filterJudgeAgreementReport(
						await loadJudgeAgreementReport(finalization.runsDirectory),
						[finalization.inputs.judgeModel],
					),
				};
	const sharedGroup = {
		caseId: finalization.caseId,
		groupId: finalization.groupId,
		reps: finalization.reps,
		declaredStages: finalization.declaredStages,
		inputs: finalization.inputs,
		projectedCost: finalization.projectedCost,
		approval: { method: finalization.approvalMethod, approved: true },
		repRecords: repRecordFiles.map((path, index) => ({
			repId: `${finalization.groupId}-rep-${index + 1}`,
			ordinal: index + 1,
			path: relative(finalization.groupDirectory, path),
		})),
		reportFile: relative(finalization.groupDirectory, finalization.reportFile),
		makespanMs: finalization.makespanMs,
	};
	const group =
		finalization.mode === "session"
			? sessionConfirmationGroupRecordSchema.parse({
					schemaVersion: 2,
					mode: "session",
					preflight: finalization.preflight,
					...sharedGroup,
				})
			: confirmationGroupRecordSchema.parse({
					schemaVersion: 1,
					mode: finalization.mode,
					...sharedGroup,
				});
	await Bun.write(
		finalization.reportFile,
		`${JSON.stringify(report, null, 2)}\n`,
	);
	await Bun.write(
		finalization.groupFile,
		`${JSON.stringify(group, null, 2)}\n`,
	);
	if (
		finalization.repResults.every(({ preservedWorktree }) => !preservedWorktree)
	) {
		await rm(finalization.worktreesDirectory, { force: true, recursive: true });
	}

	return {
		groupRecordFile: finalization.groupFile,
		reportFile: finalization.reportFile,
		repRecordFiles,
	};
}

type MetricRole = "worker" | "product-owner" | "stage-judge" | "final-judge";

export interface ConfirmationProviderCalls {
	readonly worker: readonly ProviderCall[];
	readonly productOwner: readonly ProviderCall[] | undefined;
	readonly stageJudge: readonly ProviderCall[];
	readonly finalJudge: readonly ProviderCall[] | undefined;
}

interface RoleCalls {
	readonly role: MetricRole;
	readonly calls: readonly ProviderCall[];
}

export function collectConfirmationMetrics(
	providerCalls: ConfirmationProviderCalls,
): Pick<ConfirmationRepRecord, "metrics" | "workerTrajectorySteps"> {
	const required: RoleCalls[] = [
		{
			role: "worker",
			calls: providerCalls.worker.length === 0 ? [{}] : providerCalls.worker,
		},
		{
			role: "product-owner",
			calls: providerCalls.productOwner ?? [{}],
		},
		{
			role: "stage-judge",
			calls:
				providerCalls.stageJudge.length === 0 ? [{}] : providerCalls.stageJudge,
		},
	];
	if (providerCalls.finalJudge !== undefined) {
		required.push({
			role: "final-judge",
			calls:
				providerCalls.finalJudge.length === 0 ? [{}] : providerCalls.finalJudge,
		});
	}

	const calls: {
		readonly role: MetricRole;
		readonly metrics: ClaudeCallMetrics;
	}[] = [];
	const missing: string[] = [];
	for (const group of required) {
		for (const call of group.calls) {
			if (call.metrics === undefined) {
				missing.push(`${group.role} call metrics`);

				continue;
			}

			calls.push({ role: group.role, metrics: call.metrics });
		}
	}
	const workerTrajectorySteps = calls
		.filter(({ role }) => role === "worker")
		.reduce((total, call) => total + call.metrics.turns, 0);

	return {
		metrics:
			missing.length === 0
				? { status: "COMPLETE", calls }
				: { status: "MISSING", calls, missing },
		workerTrajectorySteps,
	};
}
