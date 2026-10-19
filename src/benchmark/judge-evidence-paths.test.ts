import { describe, expect, it } from "bun:test";

import { validateJudgeEvidence } from "./judge-evidence-location";
import {
	RUBRIC_IDS,
	completeGrade,
	requirement,
	withFirstRequirement,
} from "./judge-test-fixtures";

const FIRST_RUBRIC_ID_INDEX = 0;

function acceptsSuppliedDiffAndContextPaths(): void {
	const grade = completeGrade("PASS");

	expect(() => {
		validateJudgeEvidence(
			grade,
			["src/audit/example.ts"],
			["src/app.module.ts"],
		);
	}).not.toThrow();
}

function acceptsCitationLocationFragments(): void {
	const grade = withFirstRequirement(completeGrade("PASS"), {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [
			{
				claim: "the worker persists metadata",
				path: "src/audit/example.ts#L10",
				source: "diff",
			},
		],
	});

	expect(() => {
		validateJudgeEvidence(
			grade,
			["src/audit/example.ts"],
			["src/app.module.ts"],
		);
	}).not.toThrow();
}

function acceptsGlobsResolvingToSuppliedPaths(): void {
	const grade = withFirstRequirement(completeGrade("PASS"), {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [
			{
				claim: "audit-log implementation files changed",
				path: "src/audit-log/*",
				source: "diff",
			},
		],
	});

	expect(() => {
		validateJudgeEvidence(
			grade,
			["src/audit/example.ts", "src/audit-log/audit-log.module.ts"],
			["src/app.module.ts"],
		);
	}).not.toThrow();
}

function acceptsSuppliedDirectoryCitations(): void {
	const grade = withFirstRequirement(completeGrade("PASS"), {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [
			{
				claim: "the module directory is new",
				path: "src/audit-log",
				source: "diff",
			},
		],
	});

	expect(() => {
		validateJudgeEvidence(
			grade,
			["src/audit/example.ts", "src/audit-log/audit-log.module.ts"],
			["src/app.module.ts"],
		);
	}).not.toThrow();
}

function rejectsGlobsWithoutSuppliedPaths(): void {
	const grade = withFirstRequirement(completeGrade("PASS"), {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [
			{
				claim: "unsupported",
				path: "src/missing/*",
				source: "diff",
			},
		],
	});

	expect(() => {
		validateJudgeEvidence(
			grade,
			["src/audit/example.ts", "src/audit-log/audit-log.module.ts"],
			["src/app.module.ts"],
		);
	}).toThrow("cited unavailable evidence");
}

function acceptsWholeSourceCitations(): void {
	const grade = withFirstRequirement(completeGrade("PASS"), {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [
			{ claim: "nothing prohibited appears", path: "diff", source: "diff" },
		],
	});

	expect(() => {
		validateJudgeEvidence(grade, ["src/audit/example.ts"], []);
	}).not.toThrow();
}

function rejectsUnavailableContextPaths(): void {
	const grade = withFirstRequirement(completeGrade("PASS"), {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [
			{
				claim: "unsupported",
				path: "missing.ts",
				source: "baseline-context",
			},
		],
	});

	expect(() => {
		validateJudgeEvidence(
			grade,
			["src/audit/example.ts"],
			["src/app.module.ts"],
		);
	}).toThrow("cited unavailable evidence");
}

describe(validateJudgeEvidence.name, () => {
	it(
		"accepts citations to supplied diff and context paths",
		acceptsSuppliedDiffAndContextPaths,
	);

	it(
		"accepts citations carrying a location fragment",
		acceptsCitationLocationFragments,
	);

	it(
		"accepts glob citations that resolve to supplied paths",
		acceptsGlobsResolvingToSuppliedPaths,
	);

	it(
		"accepts a citation naming a directory of supplied paths",
		acceptsSuppliedDirectoryCitations,
	);

	it(
		"rejects glob citations that do not resolve to supplied paths",
		rejectsGlobsWithoutSuppliedPaths,
	);

	it("accepts a citation naming its whole source", acceptsWholeSourceCitations);

	it("rejects citations to unavailable paths", rejectsUnavailableContextPaths);
});
