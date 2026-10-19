import { describe, expect, it } from "bun:test";

import { z } from "zod";

import { readStructuredOutput } from "./claude";
import type { ClaudeEnvelope } from "./contracts";
import { productAnswerSchema } from "./contracts";
import type { JudgeInvoker } from "./judge-attempt";
import { runJudgeAttempts } from "./judge-attempt";
import { createSpendCeiling } from "./spend-ceiling";
import {
	RESPONSE_DIAGNOSTICS,
	RESPONSE_SCHEMAS,
} from "./structured-response-diagnostic-test-fixtures";

const INITIAL_SCRIPTED_RESPONSE_INDEX = 0;

async function structuredFailure(work: Promise<unknown>): Promise<z.ZodError> {
	try {
		await work;
	} catch (error) {
		if (error instanceof z.ZodError) {
			return error;
		}

		throw error;
	}
	throw new Error("Expected invalid structured output to be refused");
}

class ScriptedJudge {
	public readonly prompts: string[] = [];
	#index = INITIAL_SCRIPTED_RESPONSE_INDEX;

	public constructor(private readonly responses: readonly string[]) {}

	public readonly invoke: JudgeInvoker = async (prompt) => {
		this.prompts.push(prompt);
		const index = this.#index;
		this.#index += 1;
		const response = await Promise.try(() => this.responses[index]);
		if (response === undefined) {
			throw new Error("No scripted provider response remains");
		}

		return response;
	};
}

const readStructuredOutputRetainsTheOriginalValidationErrorForAnUnregisteredSchema =
	async (): Promise<void> => {
		const original = new z.ZodError([
			{
				code: "custom",
				message: "specific validation failure",
				path: ["field"],
			},
		]);
		const schema = z.string().transform(() => {
			throw original;
		});

		const error = await structuredFailure(
			Promise.try(() =>
				readStructuredOutput(
					{
						session_id: "provider-session",
						structured_output: "valid input",
					},
					schema,
				),
			),
		);

		expect(error).toBe(original);
	};

const readStructuredOutputRetainsSyntaxErrorsFromTextOutput = (): void => {
	const envelope = { result: "{", session_id: "provider-session" };

	expect(() => readStructuredOutput(envelope, productAnswerSchema)).toThrow(
		SyntaxError,
	);
};

describe(readStructuredOutput.name, () => {
	describe.each([...RESPONSE_DIAGNOSTICS])(
		"$name",
		({ expected, payload, schema }) => {
			it.each(["structured_output", "result"])(
				"preserves raw diagnostics from %s",
				async (field) => {
					const envelope: ClaudeEnvelope =
						field === "structured_output"
							? { session_id: "provider-session", structured_output: payload }
							: {
									result: JSON.stringify(payload),
									session_id: "provider-session",
								};

					const error = await structuredFailure(
						Promise.try(() =>
							readStructuredOutput(envelope, RESPONSE_SCHEMAS[schema]),
						),
					);

					expect(error.message).toBe(expected);
					expect(error.name).toBe("ZodError");
				},
			);
		},
	);

	it(
		"retains the original validation error for an unregistered schema",
		readStructuredOutputRetainsTheOriginalValidationErrorForAnUnregisteredSchema,
	);

	it(
		"retains syntax errors from text output",
		readStructuredOutputRetainsSyntaxErrorsFromTextOutput,
	);
});

describe(runJudgeAttempts.name, () => {
	it.each([...RESPONSE_DIAGNOSTICS])(
		"preserves the exact retry prompt when it $name",
		async ({ expected, payload, retryPrompt, schema, valid }) => {
			const provider = new ScriptedJudge([
				JSON.stringify({
					session_id: "judge-session",
					structured_output: payload,
				}),
				JSON.stringify({
					session_id: "judge-session",
					structured_output: valid,
				}),
			]);

			const result = await runJudgeAttempts(
				"Apply the trusted rubric.",
				{
					invoke: provider.invoke,
					validate: (envelope) =>
						readStructuredOutput(envelope, RESPONSE_SCHEMAS[schema]),
				},
				{
					sessionBudgetUsd: 5,
					spendCeiling: createSpendCeiling({ ceilingUsd: 10 }),
				},
			);

			expect(provider.prompts).toEqual([
				"Apply the trusted rubric.",
				retryPrompt,
			]);
			expect(result.attempts).toEqual([
				{ costUsd: 0, error: expected, outcome: "REJECTED", payload },
				{ costUsd: 0, outcome: "ACCEPTED", payload: valid },
			]);
			expect(result.value).toEqual(valid);
		},
	);
});
