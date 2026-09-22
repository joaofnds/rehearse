import { z } from "zod";
import type { Immutable } from "./contracts";
import { unhandled } from "./contracts";
import type { ToolUse } from "./transcript";
import {
	evaluateFilesRead,
	filesReadCheckSchema,
} from "./session-check-files-read";
import {
	evaluateForbiddenPattern,
	forbiddenPatternCheckSchema,
} from "./session-check-forbidden-pattern";
import {
	evaluateForbiddenText,
	forbiddenTextCheckSchema,
} from "./session-check-forbidden-text";
import type { CheckResult } from "./session-check-result";
import {
	evaluateToolCalls,
	toolCallsCheckSchema,
} from "./session-check-tool-calls";
import {
	evaluateWordBand,
	wordBandCheckSchema,
} from "./session-check-word-band";

export type { CheckResult } from "./session-check-result";
export { checkResultSchema } from "./session-check-result";

export const checkSchema = z.union([
	wordBandCheckSchema,
	forbiddenTextCheckSchema,
	forbiddenPatternCheckSchema,
	toolCallsCheckSchema,
	filesReadCheckSchema,
]);

export type Check = z.infer<typeof checkSchema>;

export interface CheckEvidence {
	readonly reply: string;
	readonly toolUses: readonly ToolUse[];
}

function evaluateCheck(
	check: Immutable<Check>,
	evidence: Immutable<CheckEvidence>,
): CheckResult {
	switch (check.kind) {
		case "word-band": {
			return evaluateWordBand(check, evidence.reply);
		}
		case "forbidden-text": {
			return evaluateForbiddenText(check, evidence.reply);
		}
		case "forbidden-pattern": {
			return evaluateForbiddenPattern(check, evidence.reply);
		}
		case "tool-calls": {
			return evaluateToolCalls(check, evidence.toolUses);
		}
		case "files-read": {
			return evaluateFilesRead(check, evidence.toolUses);
		}
		default: {
			return unhandled(check, "check kind");
		}
	}
}

export interface CheckListResult {
	readonly outcome: "SUCCESSFUL" | "UNSUCCESSFUL";
	readonly results: readonly CheckResult[];
	readonly failed: readonly CheckResult[];
}

export function evaluateChecks(
	checks: Immutable<readonly Check[]>,
	evidence: Immutable<CheckEvidence>,
): CheckListResult {
	const results = checks.map((check) => evaluateCheck(check, evidence));
	const failed = results.filter(({ status }) => status === "FAIL");

	return {
		outcome: failed.length === 0 ? "SUCCESSFUL" : "UNSUCCESSFUL",
		results,
		failed,
	};
}
