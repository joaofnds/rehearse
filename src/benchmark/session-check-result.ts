import { z } from "zod";

/**
 * The five kinds are a closed set everywhere else a check appears, so a
 * recorded result naming a sixth is a typo, not a check the reader has yet to
 * learn about.
 */
export const checkKindSchema = z.enum([
	"word-band",
	"forbidden-text",
	"forbidden-pattern",
	"tool-calls",
	"files-read",
]);

export type CheckKind = z.infer<typeof checkKindSchema>;

export const checkResultSchema = z
	.object({
		kind: checkKindSchema,
		status: z.enum(["PASS", "FAIL"]),
		detail: z.string().min(1),
	})
	.strict();

export type CheckResult = z.infer<typeof checkResultSchema>;
