import { INITIAL_CHECKPOINT_STAGE } from "./checkpoint";
import type { CheckpointRecord, HashedFile } from "./checkpoint";
import type { RunManifest } from "./manifest";
import { corpusPath } from "./recorded-runs-fixture-environment";
import {
	CASE_ID,
	CORPUS_DIGEST,
	FIXTURE_JSON_INDENT_SPACES,
	GIT_SHA1_HEX_DIGITS,
	SHA256_HEX_DIGITS,
	STOPPED_RUN_EVIDENCE,
} from "./recorded-runs-fixture-readings";

interface RecordedRunManifestProps {
	readonly timestamp: string;
	readonly sourceRoot: string;
	readonly caseId?: string;
}

const PipelineRecordData = {
	checkpoint(stage: string, settingsFile?: HashedFile): CheckpointRecord {
		return {
			artifacts: [],
			corpusFiles: [{ path: corpusPath(stage), sha256: CORPUS_DIGEST }],
			lineage: `lineage-${stage}`,
			model: "sonnet",
			settingsFile,
			stage,
			targetSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
			upstream: stage === "discuss" ? "root-lineage" : "lineage-discuss",
			workflowState: [],
		};
	},
	initialCheckpoint(settingsFile: HashedFile): CheckpointRecord {
		return {
			artifacts: [],
			corpusFiles: [],
			lineage: "lineage-initial",
			model: "sonnet",
			settingsFile,
			stage: INITIAL_CHECKPOINT_STAGE,
			targetSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
			upstream: "root-lineage",
			workflowState: [],
		};
	},
	manifest({
		timestamp,
		sourceRoot,
		caseId = CASE_ID,
	}: RecordedRunManifestProps): RunManifest {
		return {
			caseId,
			controlSha: "1".repeat(GIT_SHA1_HEX_DIGITS),
			judgeModel: "opus",
			model: "sonnet",
			pipeline: {
				stages: [
					{
						kind: "planning",
						name: "discuss",
						requiresAcceptanceCriteria: false,
						rubric: "discuss.json",
						skill: "discuss",
					},
					{
						kind: "delivery",
						name: "build",
						rubric: "build.json",
						skill: "build",
					},
				],
				statuses: ["To Do", "Build", "Done"],
				target: {
					checks: [{ command: ["bun", "run", "typecheck"] }],
					integrityFiles: ["package.json"],
				},
			},
			pipelinePath: "cases/audit-log/pipelines/default.json",
			productBrief: "the brief",
			sessionBudgetUsd: 5,
			sourceRoot,
			sourceSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
			task: "add an audit log module",
			taskId: "ACT-1",
			taskSha: "3".repeat(GIT_SHA1_HEX_DIGITS),
			timestamp,
		};
	},
	pipelineJson(pipeline: RunManifest["pipeline"]): string {
		return `${JSON.stringify(pipeline, null, FIXTURE_JSON_INDENT_SPACES)}\n`;
	},
	scorecard(stage: string): string {
		return `${JSON.stringify(
			{
				attempts: [
					{
						costUsd: 1,
						metrics: STOPPED_RUN_EVIDENCE.discussJudgeMetrics,
						outcome: "ACCEPTED",
						payload: {},
					},
				],
				costUsd: 1,
				grade: { dimensions: [], grade: "A", verdict: "CONTINUE" },
				input: {
					transcript: {
						costUsd: 2,
						exchanges: [],
						providerCalls: STOPPED_RUN_EVIDENCE.discussSessionMetrics.map(
							(metrics) => ({ metrics }),
						),
						sessionId: `${stage}-session`,
						stage,
					},
				},
				stage,
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`;
	},
	workflowCheckpoints(settingsFile: HashedFile): readonly CheckpointRecord[] {
		return [
			{
				...PipelineRecordData.initialCheckpoint(settingsFile),
				workflowState: [
					{
						path: STOPPED_RUN_EVIDENCE.taskCard,
						sha256: "4".repeat(SHA256_HEX_DIGITS),
					},
					{
						path: STOPPED_RUN_EVIDENCE.untouchedCard,
						sha256: "7".repeat(SHA256_HEX_DIGITS),
					},
				],
			},
			{
				...PipelineRecordData.checkpoint("discuss", settingsFile),
				upstream: "lineage-initial",
				workflowState: [
					{
						path: STOPPED_RUN_EVIDENCE.taskCard,
						sha256: "5".repeat(SHA256_HEX_DIGITS),
					},
					{
						path: STOPPED_RUN_EVIDENCE.untouchedCard,
						sha256: "7".repeat(SHA256_HEX_DIGITS),
					},
				],
			},
		];
	},
};

export { PipelineRecordData as default };
