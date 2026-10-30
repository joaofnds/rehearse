import type { ComparisonArm } from "./comparison-record-source-schema";
import type { Immutable } from "./contracts";
import type { InheritedVariable } from "./session-record-context-schema";

const NONE = 0;

const ONE_VALUE = 1;

const ABSENT = "absent";

/** What one record says its session inherited, undefined when it predates recording it. */
type RecordedConfiguration = Immutable<InheritedVariable[]> | undefined;

type DifferingVariable =
	| { readonly kind: "value"; readonly name: string }
	| {
			readonly kind: "only";
			readonly name: string;
			readonly arm: ComparisonArm;
	  };

type InheritedConfigurationFinding =
	| { readonly kind: "unrecorded"; readonly arms: readonly ComparisonArm[] }
	| {
			readonly kind: "mixed";
			readonly arm: ComparisonArm;
			readonly names: readonly string[];
			readonly unrecorded: boolean;
	  }
	| {
			readonly kind: "differs";
			readonly arms: readonly [ComparisonArm, ComparisonArm];
			readonly variables: readonly DifferingVariable[];
	  };

/** An arm's distinct recorded configurations, and whether some of its records predate recording it. */
interface ArmConfiguration {
	readonly configurations: readonly Immutable<InheritedVariable[]>[];
	readonly unrecorded: boolean;
}

/** Contrast order: each pair's first arm is the one its contrast subtracts from. */
const ARM_PAIRS: readonly (readonly [ComparisonArm, ComparisonArm])[] = [
	["candidate", "baseline"],
	["baseline", "control"],
	["candidate", "control"],
];

const ARMS: readonly ComparisonArm[] = ["baseline", "candidate", "control"];

function digests(
	variables: Immutable<InheritedVariable[]>,
): ReadonlyMap<string, string | undefined> {
	return new Map(variables.map(({ name, sha256 }) => [name, sha256]));
}

/** What one configuration says of a name: absent, inherited by name alone, or its digest. */
function valueOf(
	configuration: ReadonlyMap<string, string | undefined>,
	name: string,
): string {
	if (!configuration.has(name)) {
		return ABSENT;
	}

	return `inherited:${configuration.get(name) ?? ""}`;
}

function valuesOf(
	configurations: readonly ReadonlyMap<string, string | undefined>[],
	name: string,
): ReadonlySet<string> {
	return new Set(
		configurations.map((configuration) => valueOf(configuration, name)),
	);
}

function sameValues(
	left: ReadonlySet<string>,
	right: ReadonlySet<string>,
): boolean {
	return (
		left.size === right.size && [...left].every((value) => right.has(value))
	);
}

function onlyAbsent(values: ReadonlySet<string>): boolean {
	return values.size === ONE_VALUE && values.has(ABSENT);
}

function namesIn(
	configurations: readonly ReadonlyMap<string, string | undefined>[],
): readonly string[] {
	return [
		...new Set(
			configurations.flatMap((configuration) => [...configuration.keys()]),
		),
	].toSorted();
}

function namesThatDiffer(
	configurations: readonly ReadonlyMap<string, string | undefined>[],
): readonly string[] {
	return namesIn(configurations).filter(
		(name) => valuesOf(configurations, name).size > ONE_VALUE,
	);
}

function canonical(variables: Immutable<InheritedVariable[]>): string {
	return JSON.stringify(
		[...digests(variables)].toSorted(([left], [right]) =>
			left.localeCompare(right),
		),
	);
}

function armConfiguration(
	records: readonly RecordedConfiguration[],
): ArmConfiguration {
	const recorded = records.filter((record) => record !== undefined);
	const distinct = new Map(
		recorded.map((variables) => [canonical(variables), variables]),
	);

	return {
		configurations: [...distinct.values()],
		unrecorded: recorded.length < records.length,
	};
}

function mixedFinding(
	arm: ComparisonArm,
	{ configurations, unrecorded }: ArmConfiguration,
): readonly InheritedConfigurationFinding[] {
	const names = namesThatDiffer(
		configurations.map((variables) => digests(variables)),
	);
	const isMixed =
		names.length > NONE || (unrecorded && configurations.length > NONE);

	return isMixed ? [{ arm, kind: "mixed", names, unrecorded }] : [];
}

/** Compares every configuration each arm recorded, so an arm mixed with older records still shows what differs. */
function pairFinding(
	pair: readonly [ComparisonArm, ComparisonArm],
	arms: Readonly<Record<ComparisonArm, ArmConfiguration>>,
): readonly InheritedConfigurationFinding[] {
	const [leftArm, rightArm] = pair;
	const left = arms[leftArm].configurations.map((variables) =>
		digests(variables),
	);
	const right = arms[rightArm].configurations.map((variables) =>
		digests(variables),
	);
	if (left.length === NONE || right.length === NONE) {
		return [];
	}
	const variables = namesIn([...left, ...right]).flatMap(
		(name): DifferingVariable[] => {
			const leftValues = valuesOf(left, name);
			const rightValues = valuesOf(right, name);
			if (sameValues(leftValues, rightValues)) {
				return [];
			}
			if (onlyAbsent(rightValues)) {
				return [{ arm: leftArm, kind: "only", name }];
			}
			if (onlyAbsent(leftValues)) {
				return [{ arm: rightArm, kind: "only", name }];
			}

			return [{ kind: "value", name }];
		},
	);

	return variables.length === NONE
		? []
		: [{ arms: pair, kind: "differs", variables }];
}

/**
 * Where a comparison's arms ran with different Claude Code configuration from
 * the shell that started them, or cannot say, so a reader sees it beside the
 * contrast the difference may have moved.
 */
function inheritedConfigurationFindings(
	records: Readonly<Record<ComparisonArm, readonly RecordedConfiguration[]>>,
): readonly InheritedConfigurationFinding[] {
	const arms = {
		baseline: armConfiguration(records.baseline),
		candidate: armConfiguration(records.candidate),
		control: armConfiguration(records.control),
	};
	const unrecorded = ARMS.filter(
		(arm) => arms[arm].configurations.length === NONE,
	);
	const mixed = ARMS.flatMap((arm) => mixedFinding(arm, arms[arm]));

	return [
		...(unrecorded.length === NONE
			? []
			: [{ arms: unrecorded, kind: "unrecorded" as const }]),
		...mixed,
		...ARM_PAIRS.flatMap((pair) => pairFinding(pair, arms)),
	];
}

export { inheritedConfigurationFindings as default };
export type {
	DifferingVariable,
	InheritedConfigurationFinding,
	RecordedConfiguration,
};
