import { z } from "zod";

import type { CommandError } from "./command";
import type { ClaudeEnvelope } from "./contracts";
import { claudeEnvelopeSchema } from "./contracts";
import parseJsonDocument from "./json-document";
import structuredOutputValidationOrder from "./structured-output-validation-order";
import orderedValidationIssues from "./validation-issue-order";

/**
 * The provider names why it stopped in `terminal_reason`, and a budget halt
 * reports what it spent getting there while carrying no `result` at all, only
 * its `errors`. Callers that need the cause or the spend narrow on this type
 * rather than reading the message. A halt that states neither keeps the failed
 * command's message, which carries its exit code and stderr.
 */
class ClaudeSessionError extends Error {
	public readonly terminalReason: string | undefined;
	public readonly costUsd: number | undefined;
	/** What the failed call reported, so its spend can be recorded as a call's. */
	public readonly envelope: ClaudeEnvelope;

	public constructor(
		envelope: ClaudeEnvelope,
		failure?: Readonly<CommandError>,
	) {
		super(
			statedFailure(envelope) ?? failure?.message ?? "Claude session failed",
			{ cause: failure },
		);
		this.name = "ClaudeSessionError";
		this.terminalReason = envelope.terminal_reason;
		this.costUsd = envelope.total_cost_usd;
		this.envelope = envelope;
	}
}

function statedFailure(envelope: ClaudeEnvelope): string | undefined {
	if (envelope.result !== undefined && envelope.result !== "") {
		return envelope.result;
	}

	const errors = envelope.errors?.join("; ") ?? "";

	return errors === "" ? undefined : errors;
}

/** The envelope a failed command wrote, whatever its `is_error` says. */
function failedCommandEnvelope(
	error: Readonly<CommandError>,
): ClaudeEnvelope | undefined {
	const documentReading = parseJsonDocument(error.stdout, claudeEnvelopeSchema);
	if (documentReading.kind === "invalid-json") {
		return undefined;
	}

	const { parsed: envelope } = documentReading;

	return envelope.success ? envelope.data : undefined;
}

/** The envelope a session wrote, read without judging its `is_error`. */
function parseClaudeEnvelope(output: string): ClaudeEnvelope {
	return claudeEnvelopeSchema.parse(JSON.parse(output));
}

function readClaudeEnvelope(output: string): ClaudeEnvelope {
	const envelope = parseClaudeEnvelope(output);
	if (envelope.is_error === true) {
		throw new ClaudeSessionError(envelope);
	}

	return envelope;
}

function readStructuredOutput<T>(
	envelope: ClaudeEnvelope,
	schema: z.ZodType<T>,
): T {
	try {
		return parseStructuredPayload(envelope, schema);
	} catch (error) {
		const order = structuredOutputValidationOrder.get(schema);
		if (!(error instanceof z.ZodError) || order === undefined) {
			throw error;
		}

		const issues = orderedValidationIssues({ error, order });

		throw new z.ZodError([...issues]);
	}
}

function parseStructuredPayload<T>(
	envelope: ClaudeEnvelope,
	schema: z.ZodType<T>,
): T {
	if (envelope.structured_output !== undefined) {
		return schema.parse(envelope.structured_output);
	}

	if (envelope.result !== undefined && envelope.result !== "") {
		return schema.parse(JSON.parse(envelope.result));
	}

	throw new Error("Claude response did not contain structured output");
}

export {
	ClaudeSessionError,
	statedFailure,
	failedCommandEnvelope,
	parseClaudeEnvelope,
	readClaudeEnvelope,
	readStructuredOutput,
};
