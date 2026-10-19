import { z } from "zod";

/**
 * The five kinds are a closed set everywhere else a check appears, so a
 * recorded result naming a sixth is a typo, not a check the reader has yet to
 * learn about.
 */
const checkKindSchema = z.enum([
	"word-band",
	"forbidden-text",
	"forbidden-pattern",
	"tool-calls",
	"files-read",
]);

type CheckKind = z.infer<typeof checkKindSchema>;

const checkResultSchema = z
	.object({
		detail: z.string().nonempty(),
		kind: checkKindSchema,
		status: z.enum(["PASS", "FAIL"]),
	})
	.strict();

type CheckResult = z.infer<typeof checkResultSchema>;

export { checkKindSchema, checkResultSchema };
export type { CheckKind, CheckResult };
