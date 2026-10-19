import { readFile } from "node:fs/promises";

const STREAM_OUTPUT_ARGUMENT_COUNT = 5;
const OPTION_VALUE_POSITION_OFFSET = 1;
const EXPECTED_SONNET_COST_USD = 0.08;
const init = JSON.stringify({ subtype: "init", type: "system" });

const partial = JSON.stringify({
	event: { index: 0, type: "content_block_delta" },
	type: "stream_event",
});

const STREAM_RESULT_LINE = JSON.stringify({ is_error: true, type: "result" });

const printing = (exitCode: number): string[] => [
	"sh",
	"-c",
	`printf '%s\\n' "$0" "$1" "$2"; exit ${exitCode}`,
	init,
	partial,
	STREAM_RESULT_LINE,
];
const MULTI_MODEL_USAGE = {
	"claude-haiku-4-5-20251001": {
		cacheCreationInputTokens: 40,
		cacheReadInputTokens: 0,
		canonicalModel: "claude-haiku-4-5",
		contextWindow: 200_000,
		costBasis: "list",
		costUSD: 0.02,
		inputTokens: 2,
		maxOutputTokens: 32_000,
		outputTokens: 5,
		provider: "firstParty",
	},
	"claude-sonnet-5": {
		cacheCreationInputTokens: 60,
		cacheReadInputTokens: 0,
		canonicalModel: "claude-sonnet-5",
		contextWindow: 1_000_000,
		costBasis: "list",
		costUSD: 0.08,
		inputTokens: 2,
		maxOutputTokens: 64_000,
		outputTokens: 4,
		provider: "firstParty",
	},
};
const STREAM_SUCCESS_EXIT_CODE = 0;

/**
 * The result line `claude -p` wrote when it halted a resumed worker turn at its
 * budget: USD 0.5782854 spent against a USD 0.2853308 budget.
 */
async function budgetHaltEnvelope(): Promise<string> {
	const recorded = await readFile(
		new URL("__fixtures__/budget-halt-envelope.json", import.meta.url),
		"utf8",
	);

	return JSON.stringify(JSON.parse(recorded));
}

/** A command that prints this output and exits 1, as the CLI does on a halt. */
function haltingCommand(output: string): string[] {
	return ["sh", "-c", `printf '%s\\n' "$0"; exit 1`, output];
}

function workerQuestionResult(): string {
	return JSON.stringify({
		session_id: "worker-session",
		structured_output: { message: "Which scope?", status: "QUESTION" },
		total_cost_usd: 0.203,
		type: "result",
	});
}
export {
	workerQuestionResult,
	STREAM_OUTPUT_ARGUMENT_COUNT,
	OPTION_VALUE_POSITION_OFFSET,
	EXPECTED_SONNET_COST_USD,
	init,
	partial,
	STREAM_RESULT_LINE,
	printing,
	MULTI_MODEL_USAGE,
	STREAM_SUCCESS_EXIT_CODE,
	budgetHaltEnvelope,
	haltingCommand,
};
