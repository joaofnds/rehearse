import { describe, expect, it } from "bun:test";
import { parseComparisonManifest } from "./comparison-record";

interface ManifestFixtureArmPaths {
	readonly baseline: string;
	readonly candidate: string;
	readonly control?: string | undefined;
}

interface ManifestFixtureCase {
	readonly caseId: string;
	readonly arms: ManifestFixtureArmPaths;
}

interface ManifestFixture {
	readonly schemaVersion: 1;
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

	return { caseId, arms: paths };
}

function manifest(cases?: readonly ManifestFixtureCase[]): ManifestFixture {
	const benchmarkCases = cases ?? [
		comparisonCase("case-1"),
		comparisonCase("case-2"),
	];

	return {
		schemaVersion: 1,
		cases: benchmarkCases,
	};
}

describe(parseComparisonManifest.name, () => {
	it("accepts two cases with exactly the three comparison arms", () => {
		const parsed = parseComparisonManifest(JSON.stringify(manifest()));

		expect(parsed).toEqual({
			schemaVersion: 1,
			cases: [
				{
					caseId: "case-1",
					arms: {
						baseline: "groups/case-1-baseline/group.json",
						candidate: "groups/case-1-candidate/group.json",
						control: "groups/case-1-control/group.json",
					},
				},
				{
					caseId: "case-2",
					arms: {
						baseline: "groups/case-2-baseline/group.json",
						candidate: "groups/case-2-candidate/group.json",
						control: "groups/case-2-control/group.json",
					},
				},
			],
		});
	});

	it("names a missing control arm at the manifest boundary", () => {
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
	});

	it("names a duplicated case ID at the manifest boundary", () => {
		const value = manifest([
			comparisonCase("case-1"),
			comparisonCase("case-1"),
		]);

		expect(() => parseComparisonManifest(JSON.stringify(value))).toThrow(
			"case case-1 arm all field caseId: duplicate case ID",
		);
	});

	it("accepts a manifest naming a single case", () => {
		const value = manifest([comparisonCase("case-1")]);

		const parsed = parseComparisonManifest(JSON.stringify(value));

		expect(parsed.cases).toHaveLength(1);
		expect(parsed.cases[0]?.caseId).toBe("case-1");
	});

	it("names a manifest with no cases", () => {
		const value = manifest([]);

		expect(() => parseComparisonManifest(JSON.stringify(value))).toThrow(
			"case manifest arm all field cases",
		);
	});
});
