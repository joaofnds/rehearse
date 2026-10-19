import { describe, expect, it } from "bun:test";

import type { StageJudgeOutput } from "./contracts";
import {
	passingStageOutput,
	stageEvidence,
	stageJudgeInput,
} from "./stage-grading-test-fixtures";
import { validateStageJudgeEvidence } from "./stage-judge-evidence";
import { parseStageRubric } from "./stage-rubric";

const OMITTED_INITIAL_REQUIREMENT_COUNT = 1;

function acceptsFragmentsInFrozenJsonSources(): void {
	const rubric = parseStageRubric(
		JSON.stringify({
			dimensions: [
				{
					description: "Clarity",
					excellent: "Excellent",
					good: "Good",
					id: "clarity",
				},
			],
			hardBlockers: [
				{
					description: "Valid delivery",
					id: "invalid-stage-delivery",
				},
			],
			requirements: [{ description: "Scope", id: "scope" }],
			stage: "discuss",
		}),
	);
	const base = passingStageOutput(rubric);
	const output: StageJudgeOutput = {
		...base,
		requirements: [
			{
				evidence: [
					stageEvidence("transcript", "discuss.transcript.json#exchanges"),
				],
				id: "scope",
				status: "PASS",
			},
			...base.requirements.slice(OMITTED_INITIAL_REQUIREMENT_COUNT),
		],
	};

	expect(() => {
		validateStageJudgeEvidence(output, stageJudgeInput("discuss"));
	}).not.toThrow();
}

function acceptsWholeSourceCitations(): void {
	const rubric = parseStageRubric(
		JSON.stringify({
			dimensions: [
				{
					description: "Clarity",
					excellent: "Excellent",
					good: "Good",
					id: "clarity",
				},
			],
			hardBlockers: [
				{ description: "Valid delivery", id: "invalid-stage-delivery" },
			],
			requirements: [{ description: "Scope", id: "scope" }],
		}),
	);
	const base = passingStageOutput(rubric);
	const output: StageJudgeOutput = {
		...base,
		requirements: [
			{
				evidence: [stageEvidence("diff", "diff")],
				id: "scope",
				status: "PASS",
			},
			...base.requirements.slice(OMITTED_INITIAL_REQUIREMENT_COUNT),
		],
	};

	expect(() => {
		validateStageJudgeEvidence(output, {
			...stageJudgeInput("build"),
			changedPaths: ["src/a.ts"],
			diff: "d",
		});
	}).not.toThrow();
}

function acceptsWholeSourceFieldSpellings(): void {
	const rubric = parseStageRubric(
		JSON.stringify({
			dimensions: [
				{
					description: "Clarity",
					excellent: "Excellent",
					good: "Good",
					id: "clarity",
				},
			],
			hardBlockers: [
				{ description: "Valid delivery", id: "invalid-stage-delivery" },
			],
			requirements: [{ description: "Scope", id: "scope" }],
		}),
	);
	const base = passingStageOutput(rubric);
	const output: StageJudgeOutput = {
		...base,
		requirements: [
			{
				evidence: [stageEvidence("baseline-context", "baselineContext")],
				id: "scope",
				status: "PASS",
			},
			...base.requirements.slice(OMITTED_INITIAL_REQUIREMENT_COUNT),
		],
	};

	expect(() => {
		validateStageJudgeEvidence(output, stageJudgeInput("shape"));
	}).not.toThrow();
}

function acceptsWholeSourceCitationFragments(): void {
	const rubric = parseStageRubric(
		JSON.stringify({
			dimensions: [
				{
					description: "Clarity",
					excellent: "Excellent",
					good: "Good",
					id: "clarity",
				},
			],
			hardBlockers: [
				{ description: "Valid delivery", id: "invalid-stage-delivery" },
			],
			requirements: [{ description: "Scope", id: "scope" }],
		}),
	);
	const base = passingStageOutput(rubric);
	const output: StageJudgeOutput = {
		...base,
		requirements: [
			{
				evidence: [stageEvidence("product-brief", "product-brief#details")],
				id: "scope",
				status: "PASS",
			},
			...base.requirements.slice(OMITTED_INITIAL_REQUIREMENT_COUNT),
		],
	};

	expect(() => {
		validateStageJudgeEvidence(output, stageJudgeInput("build"));
	}).not.toThrow();
}

function rejectsPathsOutsideFrozenStageInput(): void {
	const rubric = parseStageRubric(
		JSON.stringify({
			dimensions: [
				{
					description: "Clarity",
					excellent: "Excellent",
					good: "Good",
					id: "clarity",
				},
			],
			hardBlockers: [
				{
					description: "Valid delivery",
					id: "invalid-stage-delivery",
				},
			],
			requirements: [{ description: "Scope", id: "scope" }],
			stage: "discuss",
		}),
	);
	const base = passingStageOutput(rubric);
	const output: StageJudgeOutput = {
		...base,
		requirements: [
			{
				evidence: [stageEvidence("artifact", "backlog/docs/missing-spec.md")],
				id: "scope",
				status: "PASS",
			},
			...base.requirements.slice(OMITTED_INITIAL_REQUIREMENT_COUNT),
		],
	};

	expect(() => {
		validateStageJudgeEvidence(output, stageJudgeInput("discuss"));
	}).toThrow("cited unavailable evidence");
}

describe(validateStageJudgeEvidence.name, () => {
	it(
		"accepts a fragment within a frozen JSON source",
		acceptsFragmentsInFrozenJsonSources,
	);

	it("accepts a citation naming its whole source", acceptsWholeSourceCitations);

	it(
		"accepts a whole-source citation in the input's own field spelling",
		acceptsWholeSourceFieldSpellings,
	);

	it(
		"accepts a whole-source citation carrying a fragment",
		acceptsWholeSourceCitationFragments,
	);

	it(
		"rejects citations outside the frozen stage input",
		rejectsPathsOutsideFrozenStageInput,
	);
});
