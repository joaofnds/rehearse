import { z } from "zod";

import type { Immutable } from "./contracts";
import type { CheckResult } from "./session-check-result";

const EMPTY_COLLECTION_LENGTH = 0;

const forbiddenTextCheckSchema = z
	.object({
		kind: z.literal("forbidden-text"),
		strings: z.array(z.string().nonempty()).nonempty(),
	})
	.strict();

type ForbiddenTextCheck = z.infer<typeof forbiddenTextCheckSchema>;

function evaluateForbiddenText(
	check: Immutable<ForbiddenTextCheck>,
	reply: string,
): CheckResult {
	const present = check.strings.filter((forbidden) =>
		reply.includes(forbidden),
	);
	if (present.length === EMPTY_COLLECTION_LENGTH) {
		return {
			detail: `none of ${String(check.strings.length)} forbidden strings present`,
			kind: check.kind,
			status: "PASS",
		};
	}

	return {
		detail: `reply contains ${present.map((forbidden) => JSON.stringify(forbidden)).join(", ")}`,
		kind: check.kind,
		status: "FAIL",
	};
}

export { forbiddenTextCheckSchema, evaluateForbiddenText };
export type { ForbiddenTextCheck };
