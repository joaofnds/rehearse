import { describe, expect, it } from "bun:test";

import { parsePipeline } from "./pipeline";
import {
	PipelineDefinitionBuilder,
	availableRubrics,
} from "./pipeline-definition-test-builder";
import PipelineStageEntryBuilder from "./pipeline-stage-test-builder";

const { target } = new PipelineDefinitionBuilder().build();
const deliveryStage = new PipelineStageEntryBuilder({
	artifact: undefined,
	kind: "delivery",
	name: "build",
	rubric: "rubrics/build.json",
	skill: "build",
}).build();
const BUILD_STAGE_POSITION = 3;
const pipelineStageDeclarationsRejectsAnUnknownPipelineField = (): void => {
	expect(() =>
		parsePipeline(
			JSON.stringify({
				stages: [new PipelineStageEntryBuilder().build(), deliveryStage],
				statuses: ["To Do", "Done"],
				target,
				unknown: true,
			}),
			availableRubrics,
		),
	).toThrow(/definition/u);
};

const pipelineStageDeclarationsParsesTheFourstageDefaultIntoOrderedStages =
	(): void => {
		const parsed = parsePipeline(
			new PipelineDefinitionBuilder({
				stages: [
					new PipelineStageEntryBuilder().build(),
					new PipelineStageEntryBuilder({
						artifact: "grilled",
						name: "grill",
						rubric: "rubrics/grill.json",
						skill: "grill",
					}).build(),
					new PipelineStageEntryBuilder({
						artifact: "plan",
						name: "plan",
						rubric: "rubrics/plan.json",
						skill: "plan",
					}).build(),
					deliveryStage,
				],
			}).json(),
			availableRubrics,
		);

		expect(parsed.stages.map(({ name }) => name)).toEqual([
			"discuss",
			"grill",
			"plan",
			"build",
		]);
		const [observedFirstStage] = parsed.stages;
		const observedFourthStage = parsed.stages[BUILD_STAGE_POSITION];

		expect(observedFirstStage?.kind).toBe("planning");
		expect(observedFourthStage?.kind).toBe("delivery");
	};

const pipelineStageDeclarationsAcceptsAStageNameAbsentFromTheOriginalFour =
	(): void => {
		const parsed = parsePipeline(
			new PipelineDefinitionBuilder({
				stages: [
					new PipelineStageEntryBuilder({
						artifact: "findings",
						name: "research",
						rubric: "rubrics/discuss.json",
						skill: "research",
					}).build(),
					deliveryStage,
				],
			}).json(),
			availableRubrics,
		);

		const [observedFirstStage] = parsed.stages;

		expect(observedFirstStage?.name).toBe("research");
	};

const pipelineStageDeclarationsRejectsAPipelineWithNoDeliveryStage =
	(): void => {
		expect(() =>
			parsePipeline(
				new PipelineDefinitionBuilder({
					stages: [new PipelineStageEntryBuilder().build()],
				}).json(),
				availableRubrics,
			),
		).toThrow(/delivery/u);
	};

const pipelineStageDeclarationsRejectsAPipelineWithMoreThanOneDeliveryStage =
	(): void => {
		expect(() =>
			parsePipeline(
				new PipelineDefinitionBuilder({
					stages: [
						deliveryStage,
						{ ...deliveryStage, name: "ship", skill: "ship" },
					],
				}).json(),
				availableRubrics,
			),
		).toThrow(/delivery/u);
	};

const pipelineStageDeclarationsRejectsADeliveryStageThatIsNotLast =
	(): void => {
		expect(() =>
			parsePipeline(
				new PipelineDefinitionBuilder({
					stages: [deliveryStage, new PipelineStageEntryBuilder().build()],
				}).json(),
				availableRubrics,
			),
		).toThrow(/build.*last|last.*build/su);
	};
describe("pipeline composition and delivery ordering", () => {
	it(
		"rejects an unknown pipeline field",
		pipelineStageDeclarationsRejectsAnUnknownPipelineField,
	);
	it(
		"parses the four-stage default into ordered stages",
		pipelineStageDeclarationsParsesTheFourstageDefaultIntoOrderedStages,
	);
	it(
		"accepts a stage name absent from the original four",
		pipelineStageDeclarationsAcceptsAStageNameAbsentFromTheOriginalFour,
	);
	it(
		"rejects a pipeline with no delivery stage",
		pipelineStageDeclarationsRejectsAPipelineWithNoDeliveryStage,
	);
	it(
		"rejects a pipeline with more than one delivery stage",
		pipelineStageDeclarationsRejectsAPipelineWithMoreThanOneDeliveryStage,
	);
	it(
		"rejects a delivery stage that is not last",
		pipelineStageDeclarationsRejectsADeliveryStageThatIsNotLast,
	);
});
