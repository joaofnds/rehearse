import type { z } from "zod";

import type { ClaudeCallMetrics, Immutable } from "#benchmark/contracts";
import type {
	MissingPart,
	PlacedStage,
	Reading,
	TokenReading,
} from "#server/run-record-contract";
import { unrecordedOr } from "#server/run-record-reading";
import { CALL_WITHOUT_METRICS_REASON } from "#server/run-record-reasons";
import { COUNTED_CALLS } from "#server/run-stage-file";
import type { callsSchema } from "#server/run-stage-file";
import stageStatus from "#server/run-stage-status";

const FINAL_PROVIDER_CALL_OFFSET = -1;

const EMPTY_METRIC_TOTAL = 0;

const EMPTY_COLLECTION_LENGTH = 0;

function usd(
	amount: number | undefined,
	reason: string,
): Reading<{ readonly usd: number }> {
	if (amount === undefined) {
		return { reasons: [reason], state: "unavailable" };
	}

	return { state: "available", usd: amount };
}

/**
 * Each Judge call's cost is its own, so one kept without metrics leaves out
 * what it may have cost. A failed Judge's calls are read before its attempts,
 * as its tokens are.
 */
function judgeCost(
	costUsd: number | undefined,
	judge: {
		readonly providerCalls: Calls | undefined;
		readonly attempts: Calls | undefined;
	},
	absent: string,
): Reading<{ readonly usd: number }> {
	const calls = judge.providerCalls ?? judge.attempts;
	if (calls !== undefined && lacksMetrics(calls)) {
		return { reasons: [CALL_WITHOUT_METRICS_REASON], state: "unavailable" };
	}

	return usd(costUsd, absent);
}

/**
 * A resumed call reports the session's running total, so only a last call
 * kept without metrics leaves the session's cost unknown.
 */
function sessionCost(recorded: PlacedStage): Reading<{ readonly usd: number }> {
	const { file } = recorded;
	const calls =
		file?.input?.transcript?.providerCalls ?? file?.session?.providerCalls;
	const lastCall =
		calls === COUNTED_CALLS ? undefined : calls?.at(FINAL_PROVIDER_CALL_OFFSET);
	if (lastCall !== undefined && lastCall.metrics === undefined) {
		return { reasons: [CALL_WITHOUT_METRICS_REASON], state: "unavailable" };
	}

	return usd(
		file?.input?.transcript?.costUsd ?? file?.session?.costUsd,
		unrecordedOr(recorded, "the stage record holds no session cost"),
	);
}

function stageJudgeCost(
	recorded: PlacedStage,
): Reading<{ readonly usd: number }> {
	return judgeCost(
		recorded.file?.costUsd,
		{
			attempts: recorded.file?.attempts,
			providerCalls: recorded.file?.judgeProviderCalls,
		},
		unrecordedOr(recorded, "the stage record holds no judge cost"),
	);
}

type Calls = Immutable<z.infer<typeof callsSchema>>;

/** A part of a sum: the calls the records hold for it, or why they hold none. */
type TokenPart = { readonly calls: Calls } | { readonly missing: MissingPart };

function lacksMetrics(calls: Calls): boolean {
	return calls.some(({ metrics }) => metrics === undefined);
}

function callsPart(
	part: string,
	calls: Calls | typeof COUNTED_CALLS | undefined,
	absent: string,
): TokenPart {
	if (calls === undefined) {
		return { missing: { part, reason: absent } };
	}

	if (calls === COUNTED_CALLS) {
		return {
			missing: {
				part,
				reason: "the record counts its calls but keeps no call metrics",
			},
		};
	}

	if (calls.length === EMPTY_COLLECTION_LENGTH) {
		return { missing: { part, reason: "the record holds no calls" } };
	}

	if (lacksMetrics(calls)) {
		return {
			missing: { part, reason: CALL_WITHOUT_METRICS_REASON },
		};
	}

	return { calls };
}

/** A record's empty call list is a spender that made no calls, summed as zero. */
function spentCallsPart(
	part: string,
	calls: Calls | undefined,
	absent: string,
): TokenPart {
	if (calls?.length === EMPTY_COLLECTION_LENGTH) {
		return { calls };
	}

	return callsPart(part, calls, absent);
}

type Spender = "session" | "judge";

/**
 * Who spent on a stage: its session, then its judge once the judge ran. A
 * stage that wrote no record spent only when the run ended or runs in it. A
 * stop record without the Judge's input is a ceiling stop that came before
 * the Judge, while one an operator stop wrote mid-judgment keeps the input.
 */
function spenders({ file, place }: PlacedStage): readonly Spender[] {
	const status = stageStatus(file);
	if (status === "no-record") {
		return place === "current" ? ["session"] : [];
	}

	const judgeNeverRan = status === "stopped" && file?.input === undefined;
	if (status === "awaiting-judgment" || judgeNeverRan) {
		return ["session"];
	}

	return ["session", "judge"];
}

/**
 * A stop record's session reading with no calls is a session the ceiling
 * refused before its first call, which spent no tokens, while an empty
 * transcript is a record too old to keep its calls.
 */
function sessionTokenPart(recorded: PlacedStage): TokenPart {
	const { stage, file } = recorded;
	const transcriptCalls = file?.input?.transcript?.providerCalls;
	const part = `${stage} session`;
	const absent = unrecordedOr(
		recorded,
		"the stage record holds no session calls",
	);
	if (transcriptCalls === undefined) {
		return spentCallsPart(part, file?.session?.providerCalls, absent);
	}

	return callsPart(part, transcriptCalls, absent);
}

/**
 * A failed Judge's calls, a halted one included, read before its attempts,
 * which hold only the calls that returned. No calls is a Judge the ceiling
 * refused before its first call, which spent no tokens. Records written
 * before the calls were kept read from their attempts.
 */
function judgeTokenPart(
	part: string,
	judge: {
		readonly providerCalls: Calls | undefined;
		readonly attempts: Calls | undefined;
	},
	absent: string,
): TokenPart {
	if (judge.providerCalls === undefined) {
		return callsPart(part, judge.attempts, absent);
	}

	return spentCallsPart(part, judge.providerCalls, absent);
}

function stageTokenParts(recorded: PlacedStage): readonly TokenPart[] {
	const { stage, file } = recorded;
	return spenders(recorded).map((spender) =>
		spender === "session"
			? sessionTokenPart(recorded)
			: judgeTokenPart(
					`${stage} judge`,
					{ attempts: file?.attempts, providerCalls: file?.judgeProviderCalls },
					unrecordedOr(recorded, "the stage record holds no judge attempts"),
				),
	);
}

function tokenReading(parts: readonly TokenPart[]): TokenReading {
	const { metrics, missing } = tokenPartReadings(parts);
	if (!parts.some((part) => "calls" in part)) {
		return {
			reasons:
				missing.length === EMPTY_COLLECTION_LENGTH
					? ["the records hold no calls for this sum"]
					: missing.map(({ part, reason }) => `${part}: ${reason}`),
			state: "unavailable",
		};
	}

	const input = total(metrics, "inputTokens");
	const cacheRead = total(metrics, "cacheReadTokens");
	const cacheWrite = total(metrics, "cacheWriteTokens");

	return {
		cacheRead,
		cacheWrite,
		input,
		missing,
		output: total(metrics, "outputTokens"),
		state: "available",
		totalInput: input + cacheRead + cacheWrite,
	};
}

interface TokenPartReadings {
	readonly metrics: readonly ClaudeCallMetrics[];
	readonly missing: readonly MissingPart[];
}

function tokenPartReadings(parts: readonly TokenPart[]): TokenPartReadings {
	const metrics: ClaudeCallMetrics[] = [];
	const missing: MissingPart[] = [];
	for (const part of parts) {
		if ("missing" in part) {
			missing.push(part.missing);
		} else {
			metrics.push(...callMetrics(part.calls));
		}
	}

	return { metrics, missing };
}

function callMetrics(calls: Calls): ClaudeCallMetrics[] {
	return calls.flatMap(({ metrics }) =>
		metrics === undefined ? [] : [metrics],
	);
}

function total(
	metrics: readonly ClaudeCallMetrics[],
	field:
		| "inputTokens"
		| "outputTokens"
		| "cacheReadTokens"
		| "cacheWriteTokens",
): number {
	return metrics.reduce((sum, call) => sum + call[field], EMPTY_METRIC_TOTAL);
}

export {
	usd,
	judgeCost,
	sessionCost,
	stageJudgeCost,
	spentCallsPart,
	spenders,
	judgeTokenPart,
	stageTokenParts,
	tokenReading,
};
export type { TokenPart };
