import { z } from "zod";

import type { Immutable } from "./contracts";
import type { CheckResult } from "./session-check-result";

const FULL_PATTERN_MATCH_INDEX = 0;

const EMPTY_COLLECTION_LENGTH = 0;

function compile(regex: string, flags: string | undefined): RegExp {
	return new RegExp(regex, flags);
}

const patternSchema = z
	.object({
		flags: z.string().optional(),
		name: z.string().nonempty(),
		regex: z.string().nonempty(),
	})
	.strict()
	.superRefine(({ regex, flags }, context) => {
		try {
			compile(regex, flags);
		} catch (error) {
			context.addIssue({
				code: "custom",
				message: `A forbidden pattern is a regular expression that compiles, and this one does not: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	});

const forbiddenPatternCheckSchema = z
	.object({
		kind: z.literal("forbidden-pattern"),
		patterns: z.array(patternSchema).nonempty(),
	})
	.strict();

type ForbiddenPatternCheck = z.infer<typeof forbiddenPatternCheckSchema>;

function evaluateForbiddenPattern(
	check: Immutable<ForbiddenPatternCheck>,
	reply: string,
): CheckResult {
	const matched = check.patterns.flatMap((pattern) => {
		const match = compile(pattern.regex, pattern.flags).exec(reply);
		return match === null
			? []
			: [{ name: pattern.name, text: match[FULL_PATTERN_MATCH_INDEX] }];
	});
	if (matched.length === EMPTY_COLLECTION_LENGTH) {
		return {
			detail: `none of ${String(check.patterns.length)} forbidden patterns match`,
			kind: check.kind,
			status: "PASS",
		};
	}

	return {
		detail: `reply matches ${matched.map(({ name, text }) => `${name} (${JSON.stringify(text)})`).join(", ")}`,
		kind: check.kind,
		status: "FAIL",
	};
}

export { forbiddenPatternCheckSchema, evaluateForbiddenPattern };
export type { ForbiddenPatternCheck };
