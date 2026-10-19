import type { PipelineDefinition } from "./pipeline";
import { POSTGRES } from "./target-services-test-support";
import { TEST_TARGET } from "./test-support";

const CONFIRMATION_PIPELINE: PipelineDefinition = {
	stages: [
		{
			artifact: "spec",
			kind: "planning",
			name: "discuss",
			requiresAcceptanceCriteria: false,
			rubric: "rubrics/discuss.json",
			skill: "discuss",
		},
		{
			kind: "delivery",
			name: "build",
			rubric: "rubrics/build.json",
			skill: "build",
		},
	],
	statuses: ["To Do", "Done"],
	target: TEST_TARGET,
};

const SERVED_CONFIRMATION_PIPELINE: PipelineDefinition = {
	...CONFIRMATION_PIPELINE,
	target: {
		...CONFIRMATION_PIPELINE.target,
		services: [POSTGRES],
		setup: [{ command: ["bun", "install"] }],
	},
};

export { CONFIRMATION_PIPELINE, SERVED_CONFIRMATION_PIPELINE };
