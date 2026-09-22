import { z } from "zod";
import type { Immutable } from "./contracts";
import type { CheckResult } from "./session-check-result";

function compile(regex: string, flags: string | undefined): RegExp {
	return new RegExp(regex, flags);
}

const patternSchema = z
	.object({
		name: z.string().min(1),
		regex: z.string().min(1),
		flags: z.string().optional(),
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

export const forbiddenPatternCheckSchema = z
	.object({
		kind: z.literal("forbidden-pattern"),
		patterns: z.array(patternSchema).min(1),
	})
	.strict();

export type ForbiddenPatternCheck = z.infer<typeof forbiddenPatternCheckSchema>;

export function evaluateForbiddenPattern(
	check: Immutable<ForbiddenPatternCheck>,
	reply: string,
): CheckResult {
	const matched = check.patterns.flatMap((pattern) => {
		const match = compile(pattern.regex, pattern.flags).exec(reply);
		return match === null ? [] : [{ name: pattern.name, text: match[0] }];
	});
	if (matched.length === 0) {
		return {
			kind: check.kind,
			status: "PASS",
			detail: `none of ${String(check.patterns.length)} forbidden patterns match`,
		};
	}

	return {
		kind: check.kind,
		status: "FAIL",
		detail: `reply matches ${matched.map(({ name, text }) => `${name} (${JSON.stringify(text)})`).join(", ")}`,
	};
}
