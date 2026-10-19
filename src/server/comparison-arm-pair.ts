import type { ComparisonArm } from "#benchmark/comparison-record";
import type {
	ByArm,
	ByPair,
	ReportArm,
	ReportCase,
} from "#server/comparison-what-moved-contract";

const INITIAL_ARM_NAME_CODE_UNIT_INDEX = 0;
const INITIAL_ARM_NAME_CODE_UNITS = 1;

interface ArmPairNames {
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
}

function pairKey({ minuend, subtrahend }: ArmPairNames): string {
	return `${minuend}Minus${subtrahend[INITIAL_ARM_NAME_CODE_UNIT_INDEX]?.toUpperCase()}${subtrahend.slice(INITIAL_ARM_NAME_CODE_UNITS)}`;
}

const CANDIDATE_AGAINST_BASELINE = pairKey({
	minuend: "candidate",
	subtrahend: "baseline",
});

/**
 * The one place that decodes a `pairKey` back into its two arm names. This
 * module has no value imports (only `ComparisonArm`'s type, erased at
 * compile time), so the client imports it directly instead of re-deriving
 * the `Minus` convention on its own.
 */
function armPairNames(pair: string): ArmPairNames {
	const names = armPairs().find((candidate) => pairKey(candidate) === pair);
	if (names === undefined) {
		throw new Error(`Unknown comparison arm pair: ${pair}`);
	}

	return names;
}

/**
 * The report's own three canonical contrasts (`comparison-record.ts`'s
 * `contrasts` field: `candidateMinusBaseline`, `candidateMinusControl`,
 * `baselineMinusControl`), not every ordered pair the three arms could form.
 * Every unordered pair once, since "candidate vs baseline" and "baseline vs
 * candidate" describe the same file diff and rendering both would show the
 * same claim twice under swapped labels.
 */
function armPairs(): readonly ArmPairNames[] {
	return [
		{ minuend: "candidate", subtrahend: "baseline" },
		{ minuend: "candidate", subtrahend: "control" },
		{ minuend: "baseline", subtrahend: "control" },
	];
}

function mapArms<Value>(
	benchmarkCase: ReportCase,
	value: (arm: ReportArm, role: ComparisonArm) => Value,
): ByArm<Value> {
	return {
		baseline: value(benchmarkCase.arms.baseline, "baseline"),
		candidate: value(benchmarkCase.arms.candidate, "candidate"),
		control: value(benchmarkCase.arms.control, "control"),
	};
}

function byPair<Figure, Row>(
	arms: ByArm<Figure>,
	read: (minuend: Figure, subtrahend: Figure, names: ArmPairNames) => Row,
): ByPair<Row> {
	return Object.fromEntries(
		armPairs().map((names) => [
			pairKey(names),
			read(arms[names.minuend], arms[names.subtrahend], names),
		]),
	);
}

export {
	CANDIDATE_AGAINST_BASELINE,
	pairKey,
	armPairNames,
	armPairs,
	mapArms,
	byPair,
};
export type { ArmPairNames };
