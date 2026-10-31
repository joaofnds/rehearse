import lineCount from "./line-count";
import type { AnalysisRequest } from "./root-cause-analysis";
import type {
	AnalysisAnswer,
	AnalysisBase,
	FailedAnalysis,
	RecordedAnalysis,
	RootCauseAnalysisRecord,
} from "./root-cause-analysis-protocol";
import type {
	FailedReading,
	SessionReading,
} from "./root-cause-analysis-provider";
import type { RootCauseBundle } from "./root-cause-bundle";

const SOLE_ROOT_CAUSE_STAGE_INDEX = 0;

const MINIMUM_ELAPSED_MS = 0;

const SINGLE_ITEM_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

function answerViolation(
	answer: AnalysisAnswer,
	bundle: RootCauseBundle,
): string | undefined {
	const ran = bundle.stages;
	const answered = answer.stages.map(({ stage }) => stage).toSorted();
	const expected = ran.map(({ stage }) => stage).toSorted();
	if (answered.join("\n") !== expected.join("\n")) {
		return `The answer reads stages ${answered.join(", ")}, but the stages that ran are ${expected.join(", ")}`;
	}

	return rootCauseViolation(answer, bundle);
}

function lineRangeViolation(
	rootCause: NonNullable<AnalysisAnswer["rootCause"]>,
	corpusFiles: RootCauseBundle["corpusFiles"],
): string | undefined {
	const { stage, file, lines } = rootCause;
	if (lines === undefined) {
		return undefined;
	}

	const read = corpusFiles.find(
		(candidate) => candidate.path === file && candidate.readBy.includes(stage),
	);
	if (read === undefined) {
		return `The answer gives a line range in ${file}, but the run kept no body of it as the ${stage} stage read it`;
	}

	const bodyLines = lineCount(read.body);
	if (lines.start > lines.end || lines.end > bodyLines) {
		return `The line range ${lines.start}-${lines.end} is not within the ${bodyLines} lines of ${file} as the ${stage} stage read it`;
	}

	return undefined;
}

function recordedAnalysis(
	base: Omit<AnalysisBase, "costUsd">,
	answer: AnalysisAnswer,
	stages: readonly string[],
): RecordedAnalysis {
	return {
		...base,
		narrative: answer.narrative,
		outcome: "recorded",
		pairedRerun: answer.pairedRerun,
		rootCause: answer.rootCause,
		stages: stages.map(
			(stage) =>
				answer.stages.find((reading) => reading.stage === stage) ?? {
					role: "never ran",
					stage,
				},
		),
	};
}

function failedRecord(
	base: Omit<AnalysisBase, "costUsd">,
	reading: FailedReading,
): FailedAnalysis {
	const reason =
		reading.reason === ""
			? "The analysis call failed with no message"
			: reading.reason;
	if (reading.payload === undefined) {
		return { ...base, outcome: "failed", reason };
	}

	return { ...base, outcome: "failed", payload: reading.payload, reason };
}

/**
 * The record an analysis holds its place with before its paid call. Its reason
 * is true whenever the process ends before the outcome replaces it.
 */
function provisionalAnalysis(
	base: Omit<AnalysisBase, "costUsd">,
): FailedAnalysis {
	return {
		...base,
		outcome: "failed",
		reason: `No outcome was recorded for this analysis. Its call may not have started, may still be running, or ended before its outcome was written. The call is capped at $${base.capUsd}.`,
	};
}

interface AnalysisStop {
	readonly provisional: FailedAnalysis;
	readonly signal: NodeJS.Signals;
	readonly stopped: Readonly<Date>;
}

/**
 * A stopped call's record. The kill ends the call before it prints what it
 * spent, so the cap is the most the record can say about its cost.
 */
function stoppedAnalysis({
	provisional,
	signal,
	stopped,
}: AnalysisStop): FailedAnalysis {
	return {
		...provisional,
		durationMs: Math.max(
			stopped.getTime() - Date.parse(provisional.startedAt),
			MINIMUM_ELAPSED_MS,
		),
		reason: `stopped by ${signal} before its outcome was recorded; what the call spent is unknown, and it is capped at $${provisional.capUsd}`,
	};
}

function withCost(
	record: RootCauseAnalysisRecord,
	costUsd: number | undefined,
): RootCauseAnalysisRecord {
	if (costUsd === undefined) {
		return record;
	}

	return { ...record, costUsd };
}

interface AnalysisRecordContext {
	readonly request: AnalysisRequest;
	readonly bundleText: string;
	readonly budgetUsd: number;
	readonly started: Readonly<Date>;
	readonly finished: Readonly<Date>;
}

function analysisRecordBase({
	request,
	bundleText,
	budgetUsd,
	started,
	finished,
}: AnalysisRecordContext): Omit<AnalysisBase, "costUsd"> {
	return {
		bundleBytes: Buffer.byteLength(bundleText),
		bundleDigest: new Bun.CryptoHasher("sha256")
			.update(bundleText)
			.digest("hex"),
		capUsd: budgetUsd,
		// A clock stepped back during the call reads as no time, not negative time.
		durationMs: Math.max(
			finished.getTime() - started.getTime(),
			MINIMUM_ELAPSED_MS,
		),
		model: request.model,
		run: request.run,
		schemaVersion: 2,
		startedAt: started.toISOString(),
	} as const;
}

function resolveReading(
	base: Omit<AnalysisBase, "costUsd">,
	reading: SessionReading,
	bundle: RootCauseBundle,
): RootCauseAnalysisRecord {
	if (reading.kind === "failed") {
		return failedRecord(base, reading);
	}

	const violation = answerViolation(reading.answer, bundle);

	return violation === undefined
		? recordedAnalysis(base, reading.answer, bundle.declaredStages)
		: failedRecord(base, {
				...reading,
				kind: "failed",
				reason: violation,
			});
}

function rootCauseViolation(
	answer: AnalysisAnswer,
	bundle: RootCauseBundle,
): string | undefined {
	const stagesMarkedRootCause = answer.stages.filter(
		({ role }) => role === "root cause",
	);
	if (answer.rootCause === null) {
		return stagesMarkedRootCause.length === EMPTY_COLLECTION_LENGTH
			? undefined
			: "The answer gives a stage the root-cause role but names no root-cause file";
	}

	const { stage, file } = answer.rootCause;
	if (
		stagesMarkedRootCause.length !== SINGLE_ITEM_COUNT ||
		stagesMarkedRootCause[SOLE_ROOT_CAUSE_STAGE_INDEX]?.stage !== stage
	) {
		return `The answer names ${stage} as the root-cause stage, so ${stage} and no other stage must be the root cause`;
	}

	const rootCauseStage = bundle.stages.find(
		(candidate) => candidate.stage === stage,
	);
	if (
		rootCauseStage === undefined ||
		!rootCauseStage.corpusReads.includes(file)
	) {
		return `The root-cause file ${file} is not a corpus file the ${stage} stage read`;
	}

	return lineRangeViolation(answer.rootCause, bundle.corpusFiles);
}

export {
	withCost,
	analysisRecordBase,
	provisionalAnalysis,
	resolveReading,
	stoppedAnalysis,
};
