import type { ComparisonArm } from "./comparison-record-source-schema";
import type { Immutable } from "./contracts";
import type { InheritedVariable } from "./session-record-context-schema";

const NONE = 0;

const ONE_CONFIGURATION = 1;

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

type ArmConfiguration =
	| {
			readonly state: "recorded";
			readonly variables: Immutable<InheritedVariable[]>;
	  }
	| { readonly state: "unrecorded" }
	| {
			readonly state: "mixed";
			readonly names: readonly string[];
			readonly unrecorded: boolean;
	  };

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

function namesThatDiffer(
	configurations: readonly Immutable<InheritedVariable[]>[],
): readonly string[] {
	const maps = configurations.map((variables) => digests(variables));
	const names = new Set(maps.flatMap((map) => [...map.keys()]));

	return [...names]
		.filter((name) => {
			const [first, ...rest] = maps;

			return rest.some(
				(map) =>
					map.has(name) !== first?.has(name) ||
					map.get(name) !== first.get(name),
			);
		})
		.toSorted();
}

function armConfiguration(
	records: readonly RecordedConfiguration[],
): ArmConfiguration {
	const recorded = records.filter((record) => record !== undefined);
	const unrecorded = recorded.length < records.length;
	const distinct = new Set(records.map((record) => JSON.stringify(record)));
	const [variables] = recorded;
	if (distinct.size > ONE_CONFIGURATION) {
		return { names: namesThatDiffer(recorded), state: "mixed", unrecorded };
	}
	if (variables === undefined) {
		return { state: "unrecorded" };
	}

	return { state: "recorded", variables };
}

function differingVariables(
	[left, right]: readonly [ComparisonArm, ComparisonArm],
	leftVariables: Immutable<InheritedVariable[]>,
	rightVariables: Immutable<InheritedVariable[]>,
): readonly DifferingVariable[] {
	const leftDigests = digests(leftVariables);
	const rightDigests = digests(rightVariables);

	return namesThatDiffer([leftVariables, rightVariables]).map((name) => {
		if (!rightDigests.has(name)) {
			return { arm: left, kind: "only", name };
		}
		if (!leftDigests.has(name)) {
			return { arm: right, kind: "only", name };
		}

		return { kind: "value", name };
	});
}

function pairFinding(
	pair: readonly [ComparisonArm, ComparisonArm],
	arms: Readonly<Record<ComparisonArm, ArmConfiguration>>,
): readonly InheritedConfigurationFinding[] {
	const [leftArm, rightArm] = pair;
	const left = arms[leftArm];
	const right = arms[rightArm];
	if (left.state !== "recorded" || right.state !== "recorded") {
		return [];
	}
	const variables = differingVariables(pair, left.variables, right.variables);

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
	const unrecorded = ARMS.filter((arm) => arms[arm].state === "unrecorded");
	const mixed = ARMS.flatMap((arm): InheritedConfigurationFinding[] => {
		const configuration = arms[arm];

		return configuration.state === "mixed"
			? [
					{
						arm,
						kind: "mixed",
						names: configuration.names,
						unrecorded: configuration.unrecorded,
					},
				]
			: [];
	});

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
