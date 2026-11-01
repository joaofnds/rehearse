import type {
	JudgeAgreementCriterion,
	JudgeAgreementObservation,
	JudgeAgreementReport,
} from "./judge-agreement-contract";

const INITIAL_UNKNOWN_OBSERVATIONS = 0;

const DEGENERATE_KAPPA_DENOMINATOR = 0;

const KAPPA_NUMERATOR_FACTOR = 2;

const SORT_AFTER = 1;

const SORT_BEFORE = -1;

const SORT_EQUAL = 0;

interface MutableCriterionCounts {
	judgePassHumanPass: number;
	judgeFailHumanFail: number;
	judgePassHumanFail: number;
	judgeFailHumanPass: number;
}

interface MutableBaseline {
	readonly judgeContractSha256: string;
	readonly judgeModel: string;
	readonly stage: string;
	readonly rubricSha256: string;
	readonly criteria: Map<string, MutableCriterionCounts>;
}

function compareText(left: string, right: string): number {
	if (left < right) {
		return SORT_BEFORE;
	}

	if (left > right) {
		return SORT_AFTER;
	}

	return SORT_EQUAL;
}

function summarizeCriterion(
	rubricId: string,
	counts: Readonly<MutableCriterionCounts>,
): JudgeAgreementCriterion {
	const sampleSize =
		counts.judgePassHumanPass +
		counts.judgeFailHumanFail +
		counts.judgePassHumanFail +
		counts.judgeFailHumanPass;
	const observedAgreement =
		(counts.judgePassHumanPass + counts.judgeFailHumanFail) / sampleSize;
	const kappaDenominator =
		(counts.judgePassHumanPass + counts.judgePassHumanFail) *
			(counts.judgePassHumanFail + counts.judgeFailHumanFail) +
		(counts.judgeFailHumanPass + counts.judgeFailHumanFail) *
			(counts.judgePassHumanPass + counts.judgeFailHumanPass);
	const cohensKappa =
		kappaDenominator === DEGENERATE_KAPPA_DENOMINATOR
			? null
			: (KAPPA_NUMERATOR_FACTOR *
					(counts.judgePassHumanPass * counts.judgeFailHumanFail -
						counts.judgePassHumanFail * counts.judgeFailHumanPass)) /
				kappaDenominator;

	return {
		rubricId,
		sampleSize,
		...counts,
		cohensKappa,
		observedAgreement,
	};
}

function baselineKey(observation: Readonly<JudgeAgreementObservation>): string {
	return JSON.stringify([
		observation.judgeModel,
		observation.stage,
		observation.rubricSha256,
		observation.judgeContractSha256,
	]);
}

function incrementCounts(
	counts: Readonly<MutableCriterionCounts>,
	observation: Readonly<JudgeAgreementObservation>,
): MutableCriterionCounts {
	const incremented = { ...counts };
	if (observation.judgeDecision === "PASS") {
		if (observation.humanDecision === "PASS") {
			incremented.judgePassHumanPass += 1;
		} else {
			incremented.judgePassHumanFail += 1;
		}
	} else if (observation.humanDecision === "PASS") {
		incremented.judgeFailHumanPass += 1;
	} else {
		incremented.judgeFailHumanFail += 1;
	}

	return incremented;
}

class AgreementCounts {
	private skippedUnknownJudgeObservations = INITIAL_UNKNOWN_OBSERVATIONS;
	private readonly baselines = new Map<string, MutableBaseline>();
	public include(observation: Readonly<JudgeAgreementObservation>): void {
		if (observation.judgeContractSha256 === undefined) {
			this.skippedUnknownJudgeObservations += 1;
			return;
		}
		const baseline = this.baselineFor(
			observation,
			observation.judgeContractSha256,
		);
		const counts = baseline.criteria.get(observation.rubricId) ?? {
			judgeFailHumanFail: 0,
			judgeFailHumanPass: 0,
			judgePassHumanFail: 0,
			judgePassHumanPass: 0,
		};
		baseline.criteria.set(
			observation.rubricId,
			incrementCounts(counts, observation),
		);
	}
	private baselineFor(
		observation: Readonly<JudgeAgreementObservation>,
		judgeContractSha256: string,
	): MutableBaseline {
		const key = baselineKey(observation);
		let baseline = this.baselines.get(key);
		if (baseline === undefined) {
			baseline = {
				criteria: new Map(),
				judgeContractSha256,
				judgeModel: observation.judgeModel,
				rubricSha256: observation.rubricSha256,
				stage: observation.stage,
			};
			this.baselines.set(key, baseline);
		}

		return baseline;
	}
	public report(skippedCalibrations: number): JudgeAgreementReport {
		return {
			baselines: [...this.baselines.values()]
				.toSorted(
					(left, right) =>
						compareText(left.judgeModel, right.judgeModel) ||
						compareText(left.stage, right.stage) ||
						compareText(left.rubricSha256, right.rubricSha256) ||
						compareText(left.judgeContractSha256, right.judgeContractSha256),
				)
				.map((baseline) => ({
					criteria: [...baseline.criteria.entries()]
						.toSorted(([left], [right]) => compareText(left, right))
						.map(([rubricId, counts]) => summarizeCriterion(rubricId, counts)),
					judgeContractSha256: baseline.judgeContractSha256,
					judgeModel: baseline.judgeModel,
					rubricSha256: baseline.rubricSha256,
					stage: baseline.stage,
				})),
			skippedCalibrations,
			skippedUnknownJudgeObservations: this.skippedUnknownJudgeObservations,
		};
	}
}
function buildJudgeAgreementReport(
	observations: readonly Readonly<JudgeAgreementObservation>[],
	skippedCalibrations: number,
): JudgeAgreementReport {
	const counts = new AgreementCounts();
	for (const observation of observations) {
		counts.include(observation);
	}

	return counts.report(skippedCalibrations);
}

export { buildJudgeAgreementReport as default };
