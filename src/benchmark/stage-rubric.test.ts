import { describe, expect, it } from "bun:test";

import { parseStageRubric } from "./stage-rubric";

function rejectsIdsReusedAcrossRubricSections(): void {
	expect(() =>
		parseStageRubric(
			JSON.stringify({
				dimensions: [
					{
						description: "Quality",
						excellent: "Excellent",
						good: "Good",
						id: "quality",
					},
				],
				hardBlockers: [
					{
						description: "Valid delivery",
						id: "invalid-stage-delivery",
					},
					{ description: "Blocker", id: "same" },
				],
				requirements: [{ description: "Requirement", id: "same" }],
				stage: "discuss",
			}),
		),
	).toThrow("IDs must be unique");
}

function parsesRubricIndependentOfStageName(): void {
	const parsed = parseStageRubric(
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
			requirements: [{ description: "Cites sources", id: "sources" }],
		}),
	);

	expect(parsed.requirements.map(({ id }) => id)).toEqual(["sources"]);
}

function requiresDeliveryBlockersIndependentOfStageName(): void {
	expect(() =>
		parseStageRubric(
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
			"delivery",
		),
	).toThrow("false-test-safety");
}

function rejectsRemovalOfHarnessBlocker(): void {
	expect(() =>
		parseStageRubric(
			JSON.stringify({
				dimensions: [
					{
						description: "Clarity",
						excellent: "Excellent",
						good: "Good",
						id: "clarity",
					},
				],
				hardBlockers: [],
				requirements: [{ description: "Scope", id: "scope" }],
				stage: "discuss",
			}),
		),
	).toThrow("must retain harness blockers");
}

describe(parseStageRubric.name, () => {
	it(
		"rejects IDs reused across rubric sections",
		rejectsIdsReusedAcrossRubricSections,
	);

	it(
		"parses a rubric a stage adopts under any name",
		parsesRubricIndependentOfStageName,
	);

	it(
		"requires delivery-only blockers of a delivery stage under any name",
		requiresDeliveryBlockersIndependentOfStageName,
	);

	it(
		"rejects removal of a harness-owned blocker",
		rejectsRemovalOfHarnessBlocker,
	);
});
