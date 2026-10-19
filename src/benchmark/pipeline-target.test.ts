import { describe, expect, it } from "bun:test";

import type { Immutable } from "./contracts";
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
const pipelineTargetCommandsAndIntegrityParsesTheRequiredTargetChecksAndIntegrityFiles =
	(): void => {
		const parsed = parsePipeline(
			new PipelineDefinitionBuilder({
				stages: [new PipelineStageEntryBuilder().build(), deliveryStage],
			}).json(),
			availableRubrics,
		);

		expect(parsed).toMatchObject({ target });
	};

const pipelineTargetCommandsAndIntegrityParsesTheTargetsOptionalSetupCommands =
	(): void => {
		const withSetup = {
			...target,
			setup: [{ command: ["bun", "install", "--frozen-lockfile"] }],
		};
		const parsed = parsePipeline(
			JSON.stringify({
				stages: [new PipelineStageEntryBuilder().build(), deliveryStage],
				statuses: ["To Do", "Done"],
				target: withSetup,
			}),
			availableRubrics,
		);

		expect(parsed).toMatchObject({ target: withSetup });
	};

const pipelineTargetCommandsAndIntegrityParsesTheServicesTheTargetsChecksNeed =
	(): void => {
		const withServices = {
			...target,
			services: [
				{
					env: { POSTGRES_PASSWORD: "postgres" },
					exports: {
						DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:{port}/app",
					},
					image: "postgres:18-alpine",
					name: "postgres",
					port: 5432,
					ready: ["pg_isready", "-h", "127.0.0.1"],
				},
			],
		};
		const parsed = parsePipeline(
			JSON.stringify({
				stages: [new PipelineStageEntryBuilder().build(), deliveryStage],
				statuses: ["To Do", "Done"],
				target: withServices,
			}),
			availableRubrics,
		);

		expect(parsed).toMatchObject({ target: withServices });
	};

const pipelineTargetCommandsAndIntegrityParsesATargetThatDeclaresNoSetup =
	(): void => {
		const input = new PipelineDefinitionBuilder({
			stages: [new PipelineStageEntryBuilder().build(), deliveryStage],
		}).json();
		const parsed = parsePipeline(input, availableRubrics);

		expect(parsed.target.setup).toBeUndefined();
	};

const pipelineTargetCommandsAndIntegrityRejectsAPipelineWithoutATargetDefinition =
	(): void => {
		expect(() =>
			parsePipeline(
				JSON.stringify({
					stages: [new PipelineStageEntryBuilder().build(), deliveryStage],
					statuses: ["To Do", "Done"],
				}),
				availableRubrics,
			),
		).toThrow(/target/u);
	};

const pipelineTargetCommandsAndIntegrityRejectsName = ({
	definition,
}: Immutable<
	(typeof invalidPipelineTargetCommandsAndIntegrityExamples)[number]
>): void => {
	expect(() =>
		parsePipeline(
			JSON.stringify({
				stages: [new PipelineStageEntryBuilder().build(), deliveryStage],
				statuses: ["To Do", "Done"],
				target: definition,
			}),
			availableRubrics,
		),
	).toThrow(/target/u);
};

const invalidPipelineTargetCommandsAndIntegrityExamples = [
	{ definition: { ...target, checks: [] }, name: "empty checks" },
	{
		definition: {
			...target,
			checks: [{ command: ["bun"], env: { "A=B": "x" } }],
		},
		name: "a check environment name that is not a variable name",
	},
	{
		definition: { ...target, checks: [{ command: [] }] },
		name: "an empty command",
	},
	{
		definition: { ...target, checks: [{ command: ["bun", ""] }] },
		name: "an empty command argument",
	},
	{
		definition: {
			...target,
			checks: [{ command: ["bun"], env: { RETRIES: 2 } }],
		},
		name: "a non-string environment value",
	},
	{
		definition: {
			...target,
			checks: [{ command: ["bun"], environment: {} }],
		},
		name: "an unknown check field",
	},
	{
		definition: { ...target, integrityFiles: [] },
		name: "empty integrity files",
	},
	{
		definition: {
			...target,
			integrityFiles: ["package.json", "package.json"],
		},
		name: "duplicate integrity files",
	},
	{
		definition: {
			...target,
			integrityFiles: ["package.json", "./package.json"],
		},
		name: "dot-aliased duplicate integrity files",
	},
	{
		definition: {
			...target,
			integrityFiles: ["config/check.json", "config//check.json"],
		},
		name: "separator-aliased duplicate integrity files",
	},
	{
		definition: { ...target, integrityFiles: ["/etc/hosts"] },
		name: "an absolute integrity file",
	},
	{
		definition: {
			...target,
			integrityFiles: [String.raw`C:\checks.json`],
		},
		name: "a Windows absolute integrity file",
	},
	{
		definition: { ...target, integrityFiles: ["config/../package.json"] },
		name: "a traversing integrity file",
	},
	{
		definition: { ...target, root: "target" },
		name: "an unknown target field",
	},
];

describe("pipeline target commands and integrity", () => {
	it(
		"parses the required target checks and integrity files",
		pipelineTargetCommandsAndIntegrityParsesTheRequiredTargetChecksAndIntegrityFiles,
	);
	it(
		"parses the target's optional setup commands",
		pipelineTargetCommandsAndIntegrityParsesTheTargetsOptionalSetupCommands,
	);
	it(
		"parses the services the target's checks need",
		pipelineTargetCommandsAndIntegrityParsesTheServicesTheTargetsChecksNeed,
	);
	it(
		"parses a target that declares no setup",
		pipelineTargetCommandsAndIntegrityParsesATargetThatDeclaresNoSetup,
	);
	it(
		"rejects a pipeline without a target definition",
		pipelineTargetCommandsAndIntegrityRejectsAPipelineWithoutATargetDefinition,
	);
	it.each(invalidPipelineTargetCommandsAndIntegrityExamples)(
		"rejects $name",
		pipelineTargetCommandsAndIntegrityRejectsName,
	);
});
