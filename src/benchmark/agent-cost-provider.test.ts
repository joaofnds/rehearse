import { describe, expect, it } from "bun:test";

import agentCostAllocation from "#benchmark/agent-cost";

import {
	agent,
	available,
	fixtureAllocation,
	reasonsOf,
	unmodeled,
	withPrefix,
	withoutA4,
} from "./agent-cost-test-fixtures";

const PROVIDER_BASIS =
	"the provider's session count for models no other agent ran on";

const UNMODELED_REQUEST =
	"an attempt request names no model and may have run on any of them";

async function reportsModelCosts(): Promise<void> {
	const allocation = available(await fixtureAllocation(withoutA4));

	expect(
		allocation.byModel.map(({ model, reported, calculated }) => ({
			calculated: calculated.state,
			model,
			reported,
		})),
	).toEqual([
		{
			calculated: "incomplete",
			model: "claude-opus-5",
			reported: { costUsd: 0.03, state: "complete" },
		},
		{
			calculated: "complete",
			model: "claude-sonnet-5",
			reported: { costUsd: 0.04, state: "complete" },
		},
	]);
}

async function reportsExclusiveAgentModel(): Promise<void> {
	const allocation = await fixtureAllocation(withoutA4);

	expect(agent(allocation, "a2").provider).toEqual({
		basis: PROVIDER_BASIS,
		costUsd: 0.03,
		models: ["claude-opus-5"],
		state: "reported",
	});
}

async function ignoresZeroUsageModel(): Promise<void> {
	const synthetic = JSON.stringify({
		message: {
			content: [{ text: "No response requested.", type: "text" }],
			model: "<synthetic>",
			role: "assistant",
			stop_reason: "stop_sequence",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 0,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				input_tokens: 0,
				output_tokens: 0,
			},
		},
		requestId: "req-a2-synthetic",
		type: "assistant",
	});

	const allocation = await fixtureAllocation({
		...withoutA4,
		subagents: (recorded) =>
			withoutA4.subagents(recorded).map((each) =>
				each.agentId === "a2"
					? {
							agentId: each.agentId,
							meta: each.meta,
							transcript: `${each.transcript}\n${synthetic}`,
						}
					: each,
			),
	});

	expect(agent(allocation, "a2").provider).toEqual({
		basis: PROVIDER_BASIS,
		costUsd: 0.03,
		models: ["claude-opus-5"],
		state: "reported",
	});
}

async function keepsSharedAgentModelUnseparated(): Promise<void> {
	const allocation = await fixtureAllocation(withoutA4);

	expect([
		available(allocation).root.provider.state,
		agent(allocation, "a1").provider.state,
	]).toEqual(["not separable", "not separable"]);
}

async function keepsPrefixModelUnseparated(): Promise<void> {
	const allocation = await fixtureAllocation({
		...withPrefix,
		subagents: (recorded) => [
			...recorded,
			{
				agentId: "a6",
				meta: undefined,
				transcript:
					recorded.find(({ agentId }) => agentId === "a3")?.transcript ?? "",
			},
		],
	});

	expect(agent(allocation, "a2").provider).toEqual({
		reason: "the inherited prefix also ran on claude-opus-5",
		state: "not separable",
	});
}

async function doesNotInheritProviderModelProperties(): Promise<void> {
	const allocation = await fixtureAllocation({
		...withoutA4,
		subagents: (recorded) =>
			withoutA4.subagents(recorded).map((each) =>
				each.agentId === "a2"
					? {
							agentId: each.agentId,
							meta: each.meta,
							transcript: each.transcript.replaceAll(
								"claude-opus-5",
								"constructor",
							),
						}
					: each,
			),
	});

	expect(agent(allocation, "a2").provider).toEqual({
		reason: "the record carries no provider count for constructor",
		state: "not separable",
	});
}

async function keepsCountsUnseparatedForUnknownPrefix(): Promise<void> {
	const allocation = await fixtureAllocation(withPrefix);

	expect(agent(allocation, "a2").provider).toEqual({
		reason: "the inherited prefix holds a request on an unknown model",
		state: "not separable",
	});
}

async function marksAllModelsIncompleteForUnmodeledRequest(): Promise<void> {
	const allocation = available(await fixtureAllocation(unmodeled));

	expect(
		allocation.byModel.map(({ calculated }) =>
			reasonsOf(calculated).includes(UNMODELED_REQUEST),
		),
	).toEqual([true, true]);
}

async function keepsCountsUnseparatedForUnmodeledRequest(): Promise<void> {
	const allocation = await fixtureAllocation(unmodeled);

	expect(agent(allocation, "a2").provider).toEqual({
		reason: UNMODELED_REQUEST,
		state: "not separable",
	});
}

describe(agentCostAllocation.name, () => {
	describe("when every agent's transcript was kept", () => {
		it(
			"shows the provider's cost per model beside the calculated one",
			reportsModelCosts,
		);
		it(
			"gives an agent alone on its model the provider's count for it",
			reportsExclusiveAgentModel,
		);
		it(
			"ignores a model that only carried requests with no usage",
			ignoresZeroUsageModel,
		);
		it(
			"leaves the provider's count unseparated for agents sharing a model",
			keepsSharedAgentModelUnseparated,
		);
		describe("when the inherited prefix ran on an agent's model", () => {
			it(
				"leaves that model's provider count unseparated",
				keepsPrefixModelUnseparated,
			);
		});
		describe("when a model is named like a built-in object property", () => {
			it(
				"finds no provider count for it",
				doesNotInheritProviderModelProperties,
			);
		});
		describe("when an inherited agent left no transcript", () => {
			it(
				"separates no agent's provider count",
				keepsCountsUnseparatedForUnknownPrefix,
			);
		});
		describe("when an attempt request names no model", () => {
			it(
				"reads every model's calculated cost incomplete",
				marksAllModelsIncompleteForUnmodeledRequest,
			);
			it(
				"separates no agent's provider count",
				keepsCountsUnseparatedForUnmodeledRequest,
			);
		});
	});
});
