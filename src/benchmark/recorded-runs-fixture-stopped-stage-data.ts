import type { ClaudeCallMetrics, Immutable } from "./contracts";
import { corpusPath } from "./recorded-runs-fixture-environment";
import {
	AWAITING_JUDGE_EXCHANGE_TEXT,
	AWAITING_JUDGE_SESSION_ID,
	CEILING_STOPPED_SESSION,
	CORPUS_DIGEST,
	FIXTURE_JSON_INDENT_SPACES,
	STOPPED_RUN_ERROR,
	STOPPED_RUN_EVIDENCE,
	STOPPED_STAGE_EXCHANGE_TEXT,
	STOPPED_STAGE_SESSION_ID,
} from "./recorded-runs-fixture-readings";
import type { SessionSpend } from "./stage-session-error";

interface JudgeCeilingRecordProps {
	readonly judgeProviderCalls:
		| readonly { readonly metrics?: Immutable<ClaudeCallMetrics> }[]
		| null;
	readonly attempts: readonly object[];
}
interface SessionCeilingRecordProps {
	readonly session: SessionSpend | null;
}
interface StoppedEvidenceRecordProps {
	readonly buildSessionCalls: readonly {
		readonly metrics?: Immutable<ClaudeCallMetrics>;
	}[];
}

const StoppedStageData = {
	awaitingJudge(): string {
		return `${JSON.stringify(
			{
				input: {
					transcript: {
						costUsd: 1.5,
						exchanges: [{ agent: { message: AWAITING_JUDGE_EXCHANGE_TEXT } }],
						providerCalls: 3,
						sessionId: AWAITING_JUDGE_SESSION_ID,
						stage: "build",
					},
				},
				stage: "build",
				status: "AWAITING_STAGE_JUDGE",
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`;
	},
	discussScorecard(): string {
		return `${JSON.stringify(
			{
				costUsd: 1,
				grade: { dimensions: [], grade: "A", verdict: "CONTINUE" },
				input: {},
				stage: "discuss",
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`;
	},
	judgeCeiling(props: JudgeCeilingRecordProps): string {
		return `${JSON.stringify(
			{
				attempts: props.attempts,
				ceilingStop: { ceilingUsd: 6, spentUsd: 7 },
				costUsd: 1,
				error: STOPPED_RUN_ERROR,
				input: {
					transcript: {
						costUsd: 3,
						exchanges: [],
						providerCalls: CEILING_STOPPED_SESSION.providerCalls,
						sessionId: STOPPED_STAGE_SESSION_ID,
						stage: "build",
					},
				},
				judgeProviderCalls: props.judgeProviderCalls ?? undefined,
				prompt: "judge prompt",
				stage: "build",
				status: "STAGE_JUDGE_FAILED",
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`;
	},
	sessionCeiling(props: SessionCeilingRecordProps): string {
		return `${JSON.stringify(
			{
				ceilingStop: { ceilingUsd: 6, spentUsd: 6.25 },
				error: STOPPED_RUN_ERROR,
				productOwnerCostUsd: 0.25,
				productOwnerProviderCalls: [],
				session: props.session ?? undefined,
				stage: "build",
				status: "STAGE_JUDGE_FAILED",
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`;
	},
	stoppedEvidence(props: StoppedEvidenceRecordProps): string {
		return `${JSON.stringify(
			{
				corpusFiles: [{ path: corpusPath("build"), sha256: CORPUS_DIGEST }],
				costUsd: 0.5,
				dimensions: [],
				error: STOPPED_RUN_ERROR,
				hardBlockers: [],
				input: {
					changedPaths: STOPPED_RUN_EVIDENCE.buildChangedPaths,
					commitSubjects: STOPPED_RUN_EVIDENCE.buildCommitSubjects,
					transcript: {
						costUsd: 3,
						exchanges: [{ agent: { message: STOPPED_STAGE_EXCHANGE_TEXT } }],
						providerCalls: props.buildSessionCalls,
						sessionId: STOPPED_STAGE_SESSION_ID,
						stage: "build",
					},
				},
				requirements: [],
				stage: "build",
				status: "STAGE_JUDGE_FAILED",
				summary: "the build misses its requirements",
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`;
	},
	stoppedStage(): string {
		return `${JSON.stringify(
			{
				error: STOPPED_RUN_ERROR,
				input: {
					transcript: {
						exchanges: [{ agent: { message: STOPPED_STAGE_EXCHANGE_TEXT } }],
						sessionId: STOPPED_STAGE_SESSION_ID,
					},
				},
				stage: "build",
				status: "STAGE_JUDGE_FAILED",
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`;
	},
};
export { StoppedStageData as default };
