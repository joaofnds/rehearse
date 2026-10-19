import type { RunEvent } from "./run-events-contracts";
import judgeProgressSchema from "./run-events-judge-progress";
import { runEventKindSchema } from "./run-events-kinds";
import type { RunTokens } from "./spend-ceiling";

interface RunEventRow {
	readonly sequence: number;
	readonly run_id: string;
	readonly kind: string;
	readonly stage: string;
	readonly spent_usd: number;
	readonly elapsed_ms: number;
	readonly recorded_at: string;
	readonly judge_progress: string | null;
	readonly run_spent_usd: number | null;
	readonly run_input_tokens: number | null;
	readonly run_output_tokens: number | null;
	readonly session_id: string | null;
}

function runTokensOf(row: RunEventRow): RunTokens | undefined {
	if (row.run_input_tokens === null || row.run_output_tokens === null) {
		return undefined;
	}

	return { input: row.run_input_tokens, output: row.run_output_tokens };
}

function toRunEvent(row: RunEventRow): RunEvent {
	const fields = {
		elapsedMs: row.elapsed_ms,
		recordedAt: row.recorded_at,
		runId: row.run_id,
		runSpentUsd: row.run_spent_usd ?? undefined,
		runTokens: runTokensOf(row),
		sequence: row.sequence,
		spentUsd: row.spent_usd,
		stage: row.stage,
	};
	const kind = runEventKindSchema.parse(row.kind);
	if (kind === "judge-progress") {
		return {
			...fields,
			judge: judgeProgressSchema.parse(JSON.parse(row.judge_progress ?? "")),
			kind,
		};
	}

	if (kind === "stage-started") {
		return { ...fields, kind, sessionId: row.session_id ?? undefined };
	}

	return { ...fields, kind };
}

export { toRunEvent as default };
export type { RunEventRow };
