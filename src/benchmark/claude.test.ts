import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import {
	ClaudeSessionError,
	readClaudeEnvelope,
	readStructuredOutput,
} from "./claude";
import { productAnswerSchema } from "./contracts";

function returnsTheParsedSessionEnvelope(): void {
	const expectedTotalCostUsd = 0.5;

	const envelope = readClaudeEnvelope(
		JSON.stringify({ session_id: "session-1", total_cost_usd: 0.5 }),
	);

	expect(envelope.session_id).toBe("session-1");
	expect(envelope.total_cost_usd).toBe(expectedTotalCostUsd);
}

function throwsTheSessionSOwnErrorMessageOnAnErrorEnvelope(): void {
	expect(() =>
		readClaudeEnvelope(
			JSON.stringify({
				is_error: true,
				result: "session exhausted its budget",
				session_id: "session-1",
			}),
		),
	).toThrow("session exhausted its budget");
}

function throwsTheSessionSListedErrorsOnAnErrorEnvelopeWithNoResult(): void {
	expect(() =>
		readClaudeEnvelope(
			JSON.stringify({
				errors: ["Reached maximum budget ($0.2853308)"],
				is_error: true,
				session_id: "session-1",
				subtype: "error_max_budget_usd",
			}),
		),
	).toThrow("Reached maximum budget ($0.2853308)");
}

async function readsAHaltSSpendWhenItsErrorsAreNotAListOfMessages(): Promise<void> {
	const output = JSON.stringify({
		errors: [{ code: 1 }],
		is_error: true,
		session_id: "session-1",
		total_cost_usd: 0.1,
	});

	const failure = await failureOf(
		Promise.resolve(output).then(readClaudeEnvelope),
	);

	expect(failure).toBeInstanceOf(ClaudeSessionError);
	expect(failure).toMatchObject({ costUsd: 0.1 });
}

function throwsTheSessionSListedErrorsWhenTheErrorEnvelopeSResultIsEmpty(): void {
	expect(() =>
		readClaudeEnvelope(
			JSON.stringify({
				errors: ["Reached maximum budget ($0.2853308)"],
				is_error: true,
				result: "",
				session_id: "session-1",
			}),
		),
	).toThrow("Reached maximum budget ($0.2853308)");
}

async function carriesTheHaltSReasonAndCostWhenTheEnvelopeStatesNoResult(): Promise<void> {
	const output = JSON.stringify({
		is_error: true,
		session_id: "session-1",
		terminal_reason: "budget_exhausted",
		total_cost_usd: 0.022268,
	});

	const failure = await failureOf(
		Promise.resolve(output).then(readClaudeEnvelope),
	);

	expect(failure).toBeInstanceOf(ClaudeSessionError);
	expect(failure).toMatchObject({
		costUsd: 0.022268,
		message: "Claude session failed",
		terminalReason: "budget_exhausted",
	});
}

function readsTheStructuredOutputField(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({
			session_id: "session-1",
			structured_output: { answer: "ship it" },
		}),
	);

	const output = readStructuredOutput(envelope, productAnswerSchema);

	expect(output.answer).toBe("ship it");
}

function parsesTheResultTextWhenStructuredOutputIsAbsent(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({
			result: JSON.stringify({ answer: "ship it" }),
			session_id: "session-1",
		}),
	);

	const output = readStructuredOutput(envelope, productAnswerSchema);

	expect(output.answer).toBe("ship it");
}

function rejectsAnEnvelopeWithNoOutput(): void {
	const envelope = readClaudeEnvelope(
		JSON.stringify({ session_id: "session-1" }),
	);

	expect(() => readStructuredOutput(envelope, productAnswerSchema)).toThrow(
		"did not contain structured output",
	);
}

describe(readClaudeEnvelope.name, () => {
	it("returns the parsed session envelope", returnsTheParsedSessionEnvelope);
	it(
		"throws the session's own error message on an error envelope",
		throwsTheSessionSOwnErrorMessageOnAnErrorEnvelope,
	);
	it(
		"throws the session's listed errors on an error envelope with no result",
		throwsTheSessionSListedErrorsOnAnErrorEnvelopeWithNoResult,
	);
	it(
		"reads a halt's spend when its errors are not a list of messages",
		readsAHaltSSpendWhenItsErrorsAreNotAListOfMessages,
	);
	it(
		"throws the session's listed errors when the error envelope's result is empty",
		throwsTheSessionSListedErrorsWhenTheErrorEnvelopeSResultIsEmpty,
	);
	it(
		"carries the halt's reason and cost when the envelope states no result",
		carriesTheHaltSReasonAndCostWhenTheEnvelopeStatesNoResult,
	);
});
describe(readStructuredOutput.name, () => {
	it("reads the structured output field", readsTheStructuredOutputField);
	it(
		"parses the result text when structured output is absent",
		parsesTheResultTextWhenStructuredOutputIsAbsent,
	);
	it("rejects an envelope with no output", rejectsAnEnvelopeWithNoOutput);
	it("reads the structured output field", readsTheStructuredOutputField);
	it(
		"parses the result text when structured output is absent",
		parsesTheResultTextWhenStructuredOutputIsAbsent,
	);
	it("rejects an envelope with no output", rejectsAnEnvelopeWithNoOutput);
});
