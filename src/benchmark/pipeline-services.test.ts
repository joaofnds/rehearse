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
const postgres = {
	exports: { DATABASE_URL: "postgres://127.0.0.1:{port}/app" },
	image: "postgres:18-alpine",
	name: "postgres",
	port: 5432,
	ready: ["pg_isready", "-h", "127.0.0.1"],
};
const redis = {
	exports: { REDIS_URL: "redis://127.0.0.1:{port}" },
	image: "redis:8-alpine",
	name: "redis",
	port: 6379,
	ready: ["redis-cli", "ping"],
};
const pipelineServiceDeclarationsRejectsName = ({
	definition,
}: Immutable<
	(typeof invalidPipelineServiceDeclarationsExamples)[number]
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

const invalidPipelineServiceDeclarationsExamples = [
	{
		definition: {
			...target,
			services: [
				{
					...postgres,
					exports: { DATABASE_URL: "postgres://127.0.0.1/app" },
				},
			],
		},
		name: "a service export that leaves out the service's port",
	},
	{
		definition: { ...target, services: [{ ...postgres, exports: {} }] },
		name: "a service with no exports",
	},
	{
		definition: {
			...target,
			services: [postgres, { ...redis, name: "postgres" }],
		},
		name: "two services of one name",
	},
	{
		definition: {
			...target,
			services: [
				postgres,
				{ ...redis, exports: { DATABASE_URL: "redis://127.0.0.1:{port}" } },
			],
		},
		name: "two services exporting one variable",
	},
	{
		definition: {
			...target,
			services: [
				{
					...postgres,
					exports: { ANTHROPIC_BASE_URL: "http://127.0.0.1:{port}" },
				},
			],
		},
		name: "a service export the provider reads",
	},
	{
		definition: {
			...target,
			services: [
				{ ...postgres, exports: { CLAUDE_CONFIG_DIR: "/tmp/{port}" } },
			],
		},
		name: "a service export of a Claude setting",
	},
	{
		definition: {
			...target,
			services: [
				{
					...postgres,
					exports: { OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:{port}" },
				},
			],
		},
		name: "a service export Claude Code reads outside the provider names",
	},
	{
		definition: {
			...target,
			services: [{ ...postgres, exports: { MAX_THINKING_TOKENS: "{port}" } }],
		},
		name: "a service export of the thinking budget",
	},
	{
		definition: {
			...target,
			services: [{ ...postgres, exports: { https_proxy: "http://{port}" } }],
		},
		name: "a service export of a lowercase proxy",
	},
	{
		definition: {
			...target,
			services: [{ ...postgres, exports: { HOME: "/tmp/{port}" } }],
		},
		name: "a service export of the home directory",
	},
	{
		definition: {
			...target,
			services: [{ ...postgres, exports: { "A=B": "x{port}" } }],
		},
		name: "a service export name that is not a variable name",
	},
	{
		definition: {
			...target,
			services: [{ ...postgres, env: { "": "x" } }],
		},
		name: "an empty service environment name",
	},
	{
		definition: { ...target, services: [{ ...postgres, port: 70_000 }] },
		name: "a service port outside the TCP range",
	},
	{
		definition: { ...target, services: [{ ...postgres, ready: [] }] },
		name: "a service with no readiness command",
	},
];

describe("pipeline service declarations", () => {
	it.each(invalidPipelineServiceDeclarationsExamples)(
		"rejects $name",
		pipelineServiceDeclarationsRejectsName,
	);
});
