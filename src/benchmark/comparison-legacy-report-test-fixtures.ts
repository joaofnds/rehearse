import type {
	ComparisonReport,
	LegacyComparisonReport,
	MultiCaseComparisonReport,
} from "./comparison-record";
import type { Immutable } from "./contracts";

const RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION = 4;

const EMPTY_COLLECTION_LENGTH = 0;

type CurrentArmResources =
	MultiCaseComparisonReport["cases"][number]["arms"]["baseline"]["resources"];

type CurrentContrastResources =
	MultiCaseComparisonReport["contrasts"]["candidateMinusBaseline"]["resources"];

type VersionFourReport = Extract<
	LegacyComparisonReport,
	{
		readonly schemaVersion: typeof RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION;
		readonly mode: "pipeline";
	}
>;

type VersionFourArmResources =
	VersionFourReport["cases"][number]["arms"]["baseline"]["resources"];

type VersionFourContrastResources =
	VersionFourReport["contrasts"]["candidateMinusBaseline"]["resources"];

/** A version-5 arm's source: the one group its attempts all came from. */
interface SingleGroupSource<Rep> {
	readonly group: { readonly path: string; readonly sha256: string };
	readonly reps: readonly Omit<Rep, "group">[];
}

const VERSION_TWO_COMPARISON_SCHEMA = 2;

const VERSION_ONE_COMPARISON_SCHEMA = 1;

const withoutArmElapsed = (
	arm: Extract<
		ComparisonReport,
		{ readonly mode: "pipeline" }
	>["cases"][number]["arms"]["baseline"],
): Omit<typeof arm, "resources" | "source"> & {
	readonly resources: ReturnType<typeof armResourcesWithoutElapsed>;
	readonly source: {
		readonly group: SingleGroupSource<unknown>["group"];
		readonly reps: readonly Omit<
			(typeof arm.source.reps)[number],
			"outcomes" | "group"
		>[];
	};
} => {
	const source = singleGroupSource(arm.source);

	return {
		...arm,
		resources: armResourcesWithoutElapsed(arm.resources),
		source: {
			group: source.group,
			reps: source.reps.map(({ outcomes: _outcomes, ...rep }) => rep),
		},
	};
};

const withoutContrastElapsed = (
	contrast: Extract<
		ComparisonReport,
		{ readonly mode: "pipeline" }
	>["contrasts"]["candidateMinusBaseline"],
): Omit<typeof contrast, "resources"> & {
	readonly resources: ReturnType<typeof contrastResourcesWithoutElapsed>;
} => ({
	...contrast,
	resources: contrastResourcesWithoutElapsed(contrast.resources),
});

/**
 * What separates a version-4 report's resources from a current one's: the
 * elapsed measurement version 5 added. Tests that build an older report from a
 * current one go through here, so the next measurement to land has one place to
 * teach rather than one per test file.
 */
function armResourcesWithoutElapsed(
	resources: Immutable<CurrentArmResources>,
): VersionFourArmResources {
	if (resources.status === "UNAVAILABLE") {
		return resources;
	}
	const { elapsedMs: _elapsedMs, ...withoutElapsed } = resources;

	return withoutElapsed;
}

/**
 * What separates a version-5 arm's source from a current one's: version 6
 * names every group the arm's attempts came from, and each attempt its group.
 */
function singleGroupSource<
	Source extends {
		readonly groups: readonly {
			readonly path: string;
			readonly sha256: string;
		}[];
		readonly reps: readonly { readonly group: number }[];
	},
>(source: Source): SingleGroupSource<Source["reps"][number]> {
	const [group, ...others] = source.groups;
	if (group === undefined || others.length > EMPTY_COLLECTION_LENGTH) {
		throw new Error("expected an arm of exactly one group");
	}

	return {
		group,
		reps: withoutGroups<Source["reps"][number]>(source.reps),
	};
}

function withoutGroups<Rep extends { readonly group: number }>(
	reps: readonly Rep[],
): readonly Omit<Rep, "group">[] {
	return reps.map(({ group: _group, ...rep }) => rep);
}

function contrastResourcesWithoutElapsed(
	resources: Immutable<CurrentContrastResources>,
): VersionFourContrastResources {
	if (resources.status === "UNAVAILABLE") {
		return resources;
	}
	const { elapsedMs: _elapsedMs, ...withoutElapsed } = resources;

	return withoutElapsed;
}

function versionTwoReport(
	current: Extract<ComparisonReport, { readonly mode: "pipeline" }>,
): Extract<
	LegacyComparisonReport,
	{ readonly schemaVersion: typeof VERSION_TWO_COMPARISON_SCHEMA }
> {
	const cases = current.cases.map(({ caseId, arms }) => ({
		arms: {
			baseline: withoutArmElapsed(arms.baseline),
			candidate: withoutArmElapsed(arms.candidate),
			control: withoutArmElapsed(arms.control),
		},
		caseId,
	}));

	const contrasts = {
		baselineMinusControl: withoutContrastElapsed(
			current.contrasts.baselineMinusControl,
		),
		candidateMinusBaseline: withoutContrastElapsed(
			current.contrasts.candidateMinusBaseline,
		),
		candidateMinusControl: withoutContrastElapsed(
			current.contrasts.candidateMinusControl,
		),
	};

	return {
		...current,
		cases,
		contrasts,
		schemaVersion: VERSION_TWO_COMPARISON_SCHEMA,
	} satisfies LegacyComparisonReport;
}

export {
	armResourcesWithoutElapsed,
	contrastResourcesWithoutElapsed,
	singleGroupSource,
	VERSION_ONE_COMPARISON_SCHEMA,
	VERSION_TWO_COMPARISON_SCHEMA,
	versionTwoReport,
	withoutArmElapsed,
	withoutContrastElapsed,
	type SingleGroupSource,
};
