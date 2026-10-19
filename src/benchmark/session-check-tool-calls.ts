import { z } from "zod";

import type { Immutable } from "./contracts";
import type { CheckResult } from "./session-check-result";
import type { ToolUse } from "./transcript";

const EMPTY_COLLECTION_LENGTH = 0;

const toolCallsCheckSchema = z
	.object({
		kind: z.literal("tool-calls"),
		max: z.number().int().nonnegative().optional(),
		min: z.number().int().nonnegative().optional(),
		names: z.array(z.string().nonempty()).nonempty().optional(),
	})
	.strict()
	.refine(
		(check) =>
			check.min !== undefined ||
			check.max !== undefined ||
			check.names !== undefined,
		"A tool-calls check declares at least one of min, max, and names",
	);

type ToolCallsCheck = z.infer<typeof toolCallsCheckSchema>;

function countFailure(
	check: Immutable<ToolCallsCheck>,
	calls: number,
): string | undefined {
	if (check.min !== undefined && calls < check.min) {
		return `${String(calls)} tool calls, fewer than ${String(check.min)}`;
	}
	if (check.max !== undefined && calls > check.max) {
		return `${String(calls)} tool calls, more than ${String(check.max)}`;
	}

	return undefined;
}

function undeclaredNames(
	check: Immutable<ToolCallsCheck>,
	toolUses: Immutable<readonly ToolUse[]>,
): readonly string[] {
	const { names } = check;
	if (names === undefined) {
		return [];
	}

	return [
		...new Set(
			toolUses.map(({ name }) => name).filter((name) => !names.includes(name)),
		),
	];
}

function evaluateToolCalls(
	check: Immutable<ToolCallsCheck>,
	toolUses: Immutable<readonly ToolUse[]>,
): CheckResult {
	const offending = undeclaredNames(check, toolUses);
	if (offending.length > EMPTY_COLLECTION_LENGTH) {
		return {
			detail: `undeclared tool called: ${offending.join(", ")}`,
			kind: check.kind,
			status: "FAIL",
		};
	}

	const failure = countFailure(check, toolUses.length);

	return {
		detail: failure ?? `${String(toolUses.length)} tool calls`,
		kind: check.kind,
		status: failure === undefined ? "PASS" : "FAIL",
	};
}

export { toolCallsCheckSchema, evaluateToolCalls };
export type { ToolCallsCheck };
