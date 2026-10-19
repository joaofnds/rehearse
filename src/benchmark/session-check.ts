import { z } from "zod";

import type { Immutable } from "./contracts";
import { unhandled } from "./contracts";
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
import type { ToolUse } from "./transcript";

const EMPTY_COLLECTION_LENGTH = 0;

const checkSchema = z.union([
	wordBandCheckSchema,
	forbiddenTextCheckSchema,
	forbiddenPatternCheckSchema,
	toolCallsCheckSchema,
	filesReadCheckSchema,
]);

type Check = z.infer<typeof checkSchema>;

interface CheckEvidence {
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

interface CheckListResult {
	readonly outcome: "SUCCESSFUL" | "UNSUCCESSFUL";
	readonly results: readonly CheckResult[];
	readonly failed: readonly CheckResult[];
}

function evaluateChecks(
	checks: Immutable<readonly Check[]>,
	evidence: Immutable<CheckEvidence>,
): CheckListResult {
	const results = checks.map((check) => evaluateCheck(check, evidence));
	const failed = results.filter(({ status }) => status === "FAIL");

	return {
		failed,
		outcome:
			failed.length === EMPTY_COLLECTION_LENGTH ? "SUCCESSFUL" : "UNSUCCESSFUL",
		results,
	};
}

export { checkSchema, evaluateChecks };
export type { Check, CheckEvidence, CheckListResult };
export { checkResultSchema } from "./session-check-result";
export type { CheckResult } from "./session-check-result";
