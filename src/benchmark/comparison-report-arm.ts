import type {
	ComparisonArmEvidence,
	ComparisonProjectionInput,
	DigestedRecord,
} from "./comparison-evidence";
import { comparisonReliabilityRep } from "./comparison-quality";
import type { ComparisonArm } from "./comparison-record";
import type { ArmResources } from "./comparison-resources";
import sessionRepAssessment from "./comparison-session-assessment";
import type {
	RepCheckScore,
	RepStateScore,
	SessionQualityReading,
} from "./comparison-session-assessment";
import type {
	StageGrading,
	StageGradingRecord,
} from "./comparison-stage-grading";
import { stageGrading } from "./comparison-stage-grading";
import type {
	ReliabilityOutcome,
	ReliabilitySummary,
} from "./confirmation-report";
import { buildReliabilityOutcomes } from "./confirmation-report";
import type { Immutable } from "./contracts";
import type { OutputWords } from "./output-words";
import { replyWords } from "./output-words";

const FINAL_DECLARED_STAGE_OFFSET = -1;

const ORDINAL_BASE = 1;

const PREFIX_START_INDEX = 0;

interface RepStageGrading extends Omit<StageGrading, "words"> {
	readonly scorecard: { readonly path: string; readonly sha256: string };
}

/**
 * A rep's words are its last declared stage's output, so a rep stopped at an
 * earlier stage reads unavailable rather than counting a different stage's
 * output into the arm's average.
 */
interface StageRepGrading {
	readonly stageGrading: readonly RepStageGrading[];
	readonly words: OutputWords;
}

const STOPPED_BEFORE_LAST_STAGE_REASON =
	"the attempt was not judged on its last declared stage";

interface BuildReportArmRequest {
	readonly evidence: ComparisonArmEvidence;
	readonly contract: ComparisonProjectionInput["contract"];
	readonly quality: readonly ReliabilitySummary[];
	readonly resources: ArmResources;
}

interface BuiltReportArm {
	readonly role: ComparisonArm;
	readonly source: {
		readonly groups: readonly {
			readonly path: string;
			readonly sha256: string;
		}[];
		readonly reps: readonly {
			readonly repId: string;
			readonly ordinal: number;
			readonly group: number;
			readonly path: string;
			readonly sha256: string;
			readonly outcomes: readonly ReliabilityOutcome[];
			readonly attempt?:
				| { readonly path: string; readonly sha256: string }
				| undefined;
			readonly checks?: RepCheckScore | undefined;
			readonly judge?: SessionQualityReading | undefined;
			readonly stateResults?: RepStateScore | undefined;
			readonly words?: OutputWords | undefined;
			readonly stageGrading?: readonly RepStageGrading[] | undefined;
		}[];
	};
	readonly executedCorpus: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
	readonly quality: readonly ReliabilitySummary[];
	readonly resources: ArmResources;
}

type RepEvidenceFields = Pick<
	BuiltReportArm["source"]["reps"][number],
	"attempt" | "checks" | "judge" | "stateResults" | "words" | "stageGrading"
>;

function stageRepGrading(
	scorecards: readonly DigestedRecord<StageGradingRecord>[],
	lastStage: string | undefined,
): StageRepGrading {
	const graded = scorecards.map((scorecard) => ({
		grading: stageGrading(scorecard.record),
		scorecard,
	}));
	const last = graded.find(({ grading }) => grading.stage === lastStage);

	return {
		stageGrading: graded.map(({ scorecard, grading }) => ({
			dimensions: grading.dimensions,
			hardBlockers: grading.hardBlockers,
			scorecard: { path: scorecard.path, sha256: scorecard.sha256 },
			stage: grading.stage,
		})),
		words: last?.grading.words ?? {
			reason: STOPPED_BEFORE_LAST_STAGE_REASON,
			state: "unavailable",
		},
	};
}

function repEvidenceFields(
	rep: ComparisonArmEvidence["reps"][number],
	lastStage: string | undefined,
): RepEvidenceFields {
	if (rep.scorecards !== undefined) {
		return stageRepGrading(rep.scorecards, lastStage);
	}

	if (rep.attempt === undefined) {
		return {};
	}

	return {
		attempt: { path: rep.attempt.path, sha256: rep.attempt.sha256 },
		...sessionRepAssessment(rep.attempt.record),
		words: replyWords(rep.attempt.record.reply),
	};
}

function buildReportArm(
	request: Immutable<BuildReportArmRequest>,
): BuiltReportArm {
	const groupIds = request.evidence.groups.map(({ record }) => record.groupId);
	const reps = request.evidence.reps.map((rep, index) => {
		const outcomes = buildReliabilityOutcomes(
			request.contract.declaredStages,
			comparisonReliabilityRep(request.contract, rep.record),
		);
		const source = {
			group: groupIds.indexOf(rep.record.groupId),
			ordinal: index + ORDINAL_BASE,
			outcomes:
				request.contract.mode === "pipeline"
					? outcomes
					: outcomes.slice(
							PREFIX_START_INDEX,
							request.contract.declaredStages.length,
						),
			path: rep.path,
			repId: rep.record.repId,
			sha256: rep.sha256,
		};
		return {
			...source,
			...repEvidenceFields(
				rep,
				request.contract.declaredStages.at(FINAL_DECLARED_STAGE_OFFSET),
			),
		};
	});

	return {
		executedCorpus: request.evidence.executedCorpus.map(({ path, sha256 }) => ({
			path,
			sha256,
		})),
		quality: request.quality,
		resources: request.resources,
		role: request.evidence.role,
		source: {
			groups: request.evidence.groups.map(({ path, sha256 }) => ({
				path,
				sha256,
			})),
			reps,
		},
	};
}

export {
	buildReportArm,
	STOPPED_BEFORE_LAST_STAGE_REASON,
	type BuiltReportArm,
};
