import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";

import { createProductOwner } from "./workflow";
import {
	productOwnerConfiguration,
	productOwnerParent,
	queuedResponses,
	testResources,
} from "./workflow-test-fixtures";

testResources.registerCleanup();

const EXPECTED_REPLAYED_COST_USD = 0.3;

async function createsItsWorkingDirectoryBeforeItAsksItsFirstQuestion(): Promise<void> {
	const directory = join(await productOwnerParent(), "product-owner");
	const workingDirectories: boolean[] = [];

	const productOwner = createProductOwner(
		productOwnerConfiguration({ directory }),
		async (_command, cwd) => {
			const workingDirectory = await stat(cwd);
			workingDirectories.push(workingDirectory.isDirectory());

			return JSON.stringify({
				session_id: "po-session",
				structured_output: { answer: "Use the small scope" },
				total_cost_usd: 0.2,
			});
		},
	);

	await productOwner.ask("shape", "Which scope?");

	expect(workingDirectories).toEqual([true]);
}

async function retainsProductOwnerCallsWhenLaterMetricsAreAbsent(): Promise<void> {
	const responses = [
		JSON.stringify({
			num_turns: 2,
			session_id: "po-session",
			structured_output: { answer: "Use the small scope" },
			total_cost_usd: 0.2,
			usage: {
				cache_creation_input_tokens: 6,
				cache_read_input_tokens: 5,
				input_tokens: 50,
				output_tokens: 10,
			},
		}),
		JSON.stringify({
			session_id: "po-session",
			structured_output: { answer: "Keep the same scope" },
			total_cost_usd: 0.2,
		}),
	];

	const productOwner = createProductOwner(
		productOwnerConfiguration(),
		queuedResponses(responses),
	);

	await productOwner.ask("shape", "Which scope?");
	await productOwner.ask("shape", "Any constraints?");

	expect(productOwner.snapshot()).toEqual({
		providerCalls: [
			{
				metrics: {
					cacheReadTokens: 5,
					cacheWriteTokens: 6,
					costUsd: 0.2,
					inputTokens: 50,
					outputTokens: 10,
					turns: 2,
				},
			},
			{},
		],
		sessionId: "po-session",
		spentUsd: 0.2,
	});
}

async function chargesAResumedProductOwnerCallOnlyItsIncreaseOverTheSessionSReportedTotal(): Promise<void> {
	const expectedSpentUsd = 0.5;
	const expectedCostUsd = 0.2;

	const usage = {
		cache_creation_input_tokens: 6,
		cache_read_input_tokens: 5,
		input_tokens: 50,
		output_tokens: 10,
	};
	const responses = [
		JSON.stringify({
			num_turns: 1,
			session_id: "po-session",
			structured_output: { answer: "Use the small scope" },
			total_cost_usd: 0.2,
			usage,
		}),
		JSON.stringify({
			num_turns: 1,
			session_id: "po-session",
			structured_output: { answer: "Keep the same scope" },
			total_cost_usd: 0.5,
			usage,
		}),
	];

	const productOwner = createProductOwner(
		productOwnerConfiguration(),
		queuedResponses(responses),
	);

	await productOwner.ask("shape", "Which scope?");
	await productOwner.ask("shape", "Any constraints?");

	const {
		spentUsd,
		providerCalls: [first, resumed],
	} = productOwner.snapshot();

	expect({ firstCostUsd: first?.metrics?.costUsd, spentUsd }).toEqual({
		firstCostUsd: expectedCostUsd,
		spentUsd: expectedSpentUsd,
	});
	expect(resumed?.metrics?.costUsd).toBeCloseTo(EXPECTED_REPLAYED_COST_USD);
}

async function keepsAnEarlierProductOwnerSnapshotUnchanged(): Promise<void> {
	const expectedProviderCallCount = 1;

	const responses = [
		JSON.stringify({
			session_id: "po-session",
			structured_output: { answer: "Use the small scope" },
			total_cost_usd: 0.2,
		}),
		JSON.stringify({
			session_id: "po-session",
			structured_output: { answer: "Keep the same scope" },
			total_cost_usd: 0.2,
		}),
	];

	const productOwner = createProductOwner(
		productOwnerConfiguration(),
		queuedResponses(responses),
	);
	await productOwner.ask("shape", "Which scope?");
	const firstSnapshot = productOwner.snapshot();

	await productOwner.ask("shape", "Any constraints?");

	expect(firstSnapshot.providerCalls).toHaveLength(expectedProviderCallCount);
}

describe(createProductOwner.name, () => {
	it(
		"creates its working directory before it asks its first question",
		createsItsWorkingDirectoryBeforeItAsksItsFirstQuestion,
	);
	it(
		"retains Product Owner calls when later metrics are absent",
		retainsProductOwnerCallsWhenLaterMetricsAreAbsent,
	);
	it(
		"charges a resumed Product Owner call only its increase over the session's reported total",
		chargesAResumedProductOwnerCallOnlyItsIncreaseOverTheSessionSReportedTotal,
	);
	it(
		"keeps an earlier Product Owner snapshot unchanged",
		keepsAnEarlierProductOwnerSnapshotUnchanged,
	);
});
