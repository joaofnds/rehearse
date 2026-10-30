import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SpendCeiling } from "./spend-ceiling";
import { createSpendCeiling } from "./spend-ceiling";
import { TestResources } from "./test-support";
import type {
	ClaudeCommand,
	ProductOwner,
	ProductOwnerConfiguration,
	WorkflowStageRequest,
} from "./workflow";
import { createProductOwner } from "./workflow";

const OPTION_VALUE_POSITION_OFFSET = 1;

interface StageResultFixtureInput {
	readonly totalCostUsd: number;
}

function stageResult({ totalCostUsd }: StageResultFixtureInput): string {
	return JSON.stringify({
		session_id: "worker-session",
		structured_output: { message: "Shaped", status: "COMPLETE" },
		total_cost_usd: totalCostUsd,
		type: "result",
	});
}

function answer(totalCostUsd: number): string {
	return JSON.stringify({
		session_id: "po-session",
		structured_output: { answer: "Use the small scope" },
		total_cost_usd: totalCostUsd,
	});
}

function budgetOf(command: readonly string[]): string | undefined {
	return command[
		command.indexOf("--max-budget-usd") + OPTION_VALUE_POSITION_OFFSET
	];
}

function productOwnerFor(
	spendCeiling: SpendCeiling,
	runClaude: ClaudeCommand,
): ProductOwner {
	return createProductOwner(
		productOwnerConfiguration({ spendCeiling }),
		runClaude,
	);
}

interface BudgetHaltFixtureInput {
	readonly costUsd: number;
}

function budgetHalt({ costUsd }: BudgetHaltFixtureInput): string {
	return JSON.stringify({
		is_error: true,
		session_id: "halted-session",
		subtype: "error_max_budget_usd",
		terminal_reason: "budget_exhausted",
		total_cost_usd: costUsd,
		type: "result",
	});
}

const testResources = new TestResources();

async function productOwnerParent(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-po-test-"));
	testResources.track(directory);

	return directory;
}
const idleProductOwner: ProductOwner = {
	ask: async () => await Promise.resolve("Use the small scope"),
	snapshot: () => ({
		providerCalls: [],
		sessionId: "po-session",
		spentUsd: 0,
	}),
};
const CALL_USAGE = {
	cache_creation_input_tokens: 13,
	cache_read_input_tokens: 20,
	input_tokens: 100,
	output_tokens: 45,
};

function workflowStageRequest(
	overrides: Partial<WorkflowStageRequest> = {},
): WorkflowStageRequest {
	return {
		effort: undefined,
		model: "sonnet",
		productOwner: idleProductOwner,
		sessionBudgetUsd: 5,
		sessionId: "stage-session",
		setup: undefined,
		skill: "shape",
		spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
		stage: "shape",
		targetDir: "/target",
		taskId: "ACT-5",
		...overrides,
	};
}
function productOwnerConfiguration(
	overrides: Partial<ProductOwnerConfiguration> = {},
): ProductOwnerConfiguration {
	return {
		directory: tmpdir(),
		model: "sonnet",
		productBrief: "Keep it small",
		sessionBudgetUsd: 5,
		spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
		task: "Build it",
		...overrides,
	};
}
function responseFailed(
	response: string | Readonly<Error> | undefined,
): response is Readonly<Error> {
	return response instanceof Error;
}

function queuedResponses(
	responses: readonly (string | Readonly<Error>)[],
): ClaudeCommand {
	const pending = [...responses];

	return async () => {
		const response = pending.shift();
		if (responseFailed(response)) {
			return await Promise.reject(response);
		}

		return await Promise.resolve(response ?? "");
	};
}
interface WorkflowFailureExample {
	readonly boundary: string;
	readonly costUsd: number | undefined;
	readonly laterResponse: string | Readonly<Error>;
}

interface QuestionTurnFixtureInput {
	readonly totalCostUsd?: number | undefined;
}

function questionTurn({ totalCostUsd }: QuestionTurnFixtureInput): string {
	return JSON.stringify({
		num_turns: 1,
		session_id: "worker-session",
		structured_output: { message: "Which scope?", status: "QUESTION" },
		total_cost_usd: totalCostUsd,
		type: "result",
		usage: CALL_USAGE,
	});
}

export {
	questionTurn,
	stageResult,
	answer,
	budgetOf,
	productOwnerFor,
	budgetHalt,
	productOwnerParent,
	idleProductOwner,
	CALL_USAGE,
	workflowStageRequest,
	productOwnerConfiguration,
	queuedResponses,
	testResources,
};
export type { WorkflowFailureExample };
