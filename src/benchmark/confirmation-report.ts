import type { StageLetterGrade } from "./contracts";

const GRADED_OUTCOME_COUNT_INCREMENT = 1;

const TOTAL_OUTCOME_PROBABILITY = 1;

const NO_REQUESTED_REPS = 0;

const NO_GRADED_OUTCOMES = 0;

type ConfirmationStageOutcome =
	| {
			readonly stage: string;
			readonly status: "JUDGED";
			readonly grade: StageLetterGrade;
			readonly verdict: "CONTINUE" | "STOP";
	  }
	| {
			readonly stage: string;
			readonly status: "EXECUTION_FAILED" | "METRICS_MISSING" | "NOT_REACHED";
	  };

type ConfirmationFinalOutcome =
	| { readonly status: "JUDGED"; readonly verdict: "PASS" | "FAIL" }
	| {
			readonly status: "EXECUTION_FAILED" | "METRICS_MISSING" | "NOT_REACHED";
	  };

interface ConfirmationReliabilityRep {
	readonly metricsComplete: boolean;
	readonly stages: readonly ConfirmationStageOutcome[];
	readonly finalOutcome: ConfirmationFinalOutcome;
}

interface ReliabilitySummary {
	readonly name: string;
	readonly requested: number;
	readonly attempted: number;
	readonly notReached: number;
	readonly failed: number;
	readonly successful: number;
	readonly gradeDistribution: Readonly<Record<string, number>>;
	readonly successRate: number;
	readonly standardError: number;
	readonly passK: number;
}

function reliabilitySummaryNamed(
	quality: readonly ReliabilitySummary[],
	name: string,
): ReliabilitySummary {
	const summary = quality.find((candidate) => candidate.name === name);
	if (summary === undefined) {
		throw new Error(`Comparison arm has no ${name} quality summary`);
	}

	return summary;
}

type ReliabilityOutcome =
	| {
			readonly name: string;
			readonly status: "JUDGED";
			readonly grade: StageLetterGrade | "PASS" | "FAIL";
			readonly successful: boolean;
	  }
	| {
			readonly name: string;
			readonly status: "EXECUTION_FAILED" | "METRICS_MISSING" | "NOT_REACHED";
			readonly successful: false;
	  };

function summarizeReliabilityOutcomes(
	name: string,
	outcomes: readonly ReliabilityOutcome[],
): ReliabilitySummary {
	const requested = outcomes.length;
	if (requested === NO_REQUESTED_REPS) {
		throw new Error("A confirmation report requires at least one rep");
	}

	const attempted = outcomes.filter(
		({ status }) => status !== "NOT_REACHED",
	).length;
	const successful = outcomes.filter((outcome) => outcome.successful).length;
	const gradeDistribution = gradedOutcomesDistribution(outcomes);

	const notReached = requested - attempted;
	const successRate = successful / requested;

	return {
		attempted,
		failed: attempted - successful,
		gradeDistribution,
		name,
		notReached,
		passK: successRate ** requested,
		requested,
		standardError: Math.sqrt(
			(successRate * (TOTAL_OUTCOME_PROBABILITY - successRate)) / requested,
		),
		successRate,
		successful,
	};
}

function stageObservation(
	name: string,
	outcome: ConfirmationStageOutcome,
	metricsComplete: boolean,
): ReliabilityOutcome {
	if (outcome.status === "NOT_REACHED") {
		return { name, status: outcome.status, successful: false };
	}
	if (outcome.status !== "JUDGED") {
		return { name, status: outcome.status, successful: false };
	}

	return {
		grade: outcome.grade,
		name,
		status: outcome.status,
		successful:
			metricsComplete &&
			outcome.verdict === "CONTINUE" &&
			(outcome.grade === "A" || outcome.grade === "B"),
	};
}

function finalObservation(
	outcome: ConfirmationFinalOutcome,
	metricsComplete: boolean,
): ReliabilityOutcome {
	if (outcome.status === "NOT_REACHED") {
		return { name: "final", status: outcome.status, successful: false };
	}
	if (outcome.status !== "JUDGED") {
		return { name: "final", status: outcome.status, successful: false };
	}

	return {
		grade: outcome.verdict,
		name: "final",
		status: outcome.status,
		successful: metricsComplete && outcome.verdict === "PASS",
	};
}

function buildReliabilityOutcomes(
	declaredStages: readonly string[],
	rep: ConfirmationReliabilityRep,
): readonly ReliabilityOutcome[] {
	const stages = declaredStages.map((stage) => {
		const outcome = rep.stages.find((candidate) => candidate.stage === stage);
		if (outcome === undefined) {
			throw new Error(`Rep is missing the declared ${stage} stage`);
		}

		return stageObservation(stage, outcome, rep.metricsComplete);
	});

	return [...stages, finalObservation(rep.finalOutcome, rep.metricsComplete)];
}

function buildReliabilityReport(
	declaredStages: readonly string[],
	reps: readonly ConfirmationReliabilityRep[],
): readonly ReliabilitySummary[] {
	const outcomes = reps.map((rep) =>
		buildReliabilityOutcomes(declaredStages, rep),
	);
	const names = [...declaredStages, "final"];

	return names.map((name, index) =>
		summarizeReliabilityOutcomes(
			name,
			outcomes.map((rep) => {
				const outcome = rep[index];
				if (outcome === undefined) {
					throw new Error(`Rep is missing the declared ${name} outcome`);
				}

				return outcome;
			}),
		),
	);
}

function gradedOutcomesDistribution(
	outcomes: readonly ReliabilityOutcome[],
): ReliabilitySummary["gradeDistribution"] {
	const grades: Record<string, number> = {};

	for (const outcome of outcomes) {
		if (outcome.status === "JUDGED") {
			grades[outcome.grade] =
				(grades[outcome.grade] ?? NO_GRADED_OUTCOMES) +
				GRADED_OUTCOME_COUNT_INCREMENT;
		}
	}

	return grades;
}

export {
	reliabilitySummaryNamed,
	summarizeReliabilityOutcomes,
	buildReliabilityOutcomes,
	buildReliabilityReport,
};
export type {
	ConfirmationStageOutcome,
	ConfirmationFinalOutcome,
	ConfirmationReliabilityRep,
	ReliabilitySummary,
	ReliabilityOutcome,
};
export {
	buildResourceReport,
	buildSessionCommandTotal,
} from "./confirmation-resource-report";
export type {
	ConfirmationResourceRep,
	MetricDistributions,
	ConfirmationResourceReport,
	ConfirmationCommandTotal,
} from "./confirmation-resource-contract";
