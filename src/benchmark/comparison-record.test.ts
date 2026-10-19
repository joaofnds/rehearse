import { describe, expect, it } from "bun:test";

import {
	ComparisonManifestError,
	parseComparisonManifest,
} from "./comparison-record";

const COMPARISON_MANIFEST_FIXTURE_VERSION = 1;

interface ManifestFixtureArmPaths {
	readonly baseline: string | readonly string[];
	readonly candidate: string | readonly string[];
	readonly control?: string | readonly string[] | undefined;
}

interface ManifestFixtureCase {
	readonly caseId: string;
	readonly arms: ManifestFixtureArmPaths;
}

interface ManifestFixture {
	readonly schemaVersion: typeof COMPARISON_MANIFEST_FIXTURE_VERSION;
	readonly cases: readonly ManifestFixtureCase[];
}

function comparisonCase(
	caseId: string,
	arms?: ManifestFixtureArmPaths,
): ManifestFixtureCase {
	const paths = arms ?? {
		baseline: `groups/${caseId}-baseline/group.json`,
		candidate: `groups/${caseId}-candidate/group.json`,
		control: `groups/${caseId}-control/group.json`,
	};

	return { arms: paths, caseId };
}

function manifest(cases?: readonly ManifestFixtureCase[]): ManifestFixture {
	const benchmarkCases = cases ?? [
		comparisonCase("case-1"),
		comparisonCase("case-2"),
	];

	return {
		cases: benchmarkCases,
		schemaVersion: 1,
	};
}

interface ManifestDiagnosticExample {
	readonly json: string;
	readonly message: string;
	readonly name: string;
}

function rejectsWithHistoricalManifestDiagnostic({
	json,
	message,
}: ManifestDiagnosticExample): void {
	expect(() => parseComparisonManifest(json)).toThrow(
		new ComparisonManifestError(message),
	);
}

const MANIFEST_DIAGNOSTIC_EXAMPLES: readonly ManifestDiagnosticExample[] = [
	{
		json: "{}",
		message:
			"case manifest arm all field schemaVersion: Invalid input: expected 1",
		name: "schema version before cases",
	},
	{
		json: '{"schemaVersion":1,"cases":[{}]}',
		message:
			"case case-1 arm all field caseId: Invalid input: expected string, received undefined",
		name: "case identity before arms",
	},
	{
		json: '{"schemaVersion":1,"cases":[{"extra":true,"arms":{}}]}',
		message:
			"case case-1 arm all field caseId: Invalid input: expected string, received undefined",
		name: "case identity before strict unknown keys",
	},
	{
		json: '{"schemaVersion":1,"cases":[{"caseId":"first","arms":{}},{"arms":{"baseline":"baseline","candidate":"candidate","control":"control"}}]}',
		message: "case first arm baseline field arms.baseline: Invalid input",
		name: "first case arm before later case identity",
	},
	{
		json: '{"schemaVersion":1,"cases":[{"caseId":"first","arms":{}}]}',
		message: "case first arm baseline field arms.baseline: Invalid input",
		name: "baseline before other arms",
	},
	{
		json: '{"schemaVersion":1,"cases":[{"caseId":"same","arms":{"baseline":"baseline","candidate":"candidate","control":"control"}},{"caseId":"same","arms":{"baseline":"baseline","candidate":"candidate","control":"control"}},{"caseId":"bad id","arms":{"baseline":"baseline","candidate":"candidate","control":"control"}}]}',
		message: "case bad id arm all field caseId: Invalid comparison identity",
		name: "field errors before manifest duplicate refinements",
	},
	{
		json: '{"extra":true}',
		message:
			"case manifest arm all field schemaVersion: Invalid input: expected 1",
		name: "schema version before strict unknown keys",
	},
];

describe(parseComparisonManifest.name, () => {
	// Exact messages were characterized against d020bf3a before sorting schemas.
	it.each([...MANIFEST_DIAGNOSTIC_EXAMPLES])(
		"keeps historical diagnostic priority for $name",
		rejectsWithHistoricalManifestDiagnostic,
	);

	it(
		"accepts two cases with exactly the three comparison arms, each read as a list of groups",
		acceptsTwoCasesWithExactlyTheThreeComparisonArmsEachReadAsAListOfGroups,
	);

	it(
		"accepts an arm naming several groups, in the order named",
		acceptsAnArmNamingSeveralGroupsInTheOrderNamed,
	);

	it(
		"names a missing control arm at the manifest boundary",
		namesAMissingControlArmAtTheManifestBoundary,
	);

	it(
		"names a duplicated case ID at the manifest boundary",
		namesADuplicatedCaseIDAtTheManifestBoundary,
	);

	it(
		"accepts a manifest naming a single case",
		acceptsAManifestNamingASingleCase,
	);

	it("names a manifest with no cases", namesAManifestWithNoCases);
});

function acceptsTwoCasesWithExactlyTheThreeComparisonArmsEachReadAsAListOfGroups(): void {
	const parsed = parseComparisonManifest(JSON.stringify(manifest()));

	expect(parsed).toEqual({
		cases: [
			{
				arms: {
					baseline: ["groups/case-1-baseline/group.json"],
					candidate: ["groups/case-1-candidate/group.json"],
					control: ["groups/case-1-control/group.json"],
				},
				caseId: "case-1",
			},
			{
				arms: {
					baseline: ["groups/case-2-baseline/group.json"],
					candidate: ["groups/case-2-candidate/group.json"],
					control: ["groups/case-2-control/group.json"],
				},
				caseId: "case-2",
			},
		],
		schemaVersion: 1,
	});
}

function acceptsAnArmNamingSeveralGroupsInTheOrderNamed(): void {
	const value = manifest([
		comparisonCase("case-1", {
			baseline: [
				"groups/case-1-baseline/group.json",
				"groups/case-1-baseline-more/group.json",
			],
			candidate: "groups/case-1-candidate/group.json",
			control: "groups/case-1-control/group.json",
		}),
	]);

	const parsed = parseComparisonManifest(JSON.stringify(value));

	const [observedFirstCase] = parsed.cases;

	expect(observedFirstCase?.arms.baseline).toEqual([
		"groups/case-1-baseline/group.json",
		"groups/case-1-baseline-more/group.json",
	]);
}

function namesAMissingControlArmAtTheManifestBoundary(): void {
	const value = manifest([
		comparisonCase("case-1", {
			baseline: "groups/case-1-baseline/group.json",
			candidate: "groups/case-1-candidate/group.json",
		}),
		comparisonCase("case-2"),
	]);

	expect(() => parseComparisonManifest(JSON.stringify(value))).toThrow(
		"case case-1 arm control field arms.control",
	);
}

function namesADuplicatedCaseIDAtTheManifestBoundary(): void {
	const value = manifest([comparisonCase("case-1"), comparisonCase("case-1")]);

	expect(() => parseComparisonManifest(JSON.stringify(value))).toThrow(
		"case case-1 arm all field caseId: duplicate case ID",
	);
}

function acceptsAManifestNamingASingleCase(): void {
	const expectedCaseCount = 1;

	const value = manifest([comparisonCase("case-1")]);

	const parsed = parseComparisonManifest(JSON.stringify(value));

	const [observedFirstCase] = parsed.cases;

	expect(parsed.cases).toHaveLength(expectedCaseCount);
	expect(observedFirstCase?.caseId).toBe("case-1");
}

function namesAManifestWithNoCases(): void {
	const value = manifest([]);

	expect(() => parseComparisonManifest(JSON.stringify(value))).toThrow(
		"case manifest arm all field cases",
	);
}
