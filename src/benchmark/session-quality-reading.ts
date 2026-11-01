import { z } from "zod";

import type { Immutable } from "./contracts";
import type { SessionAttempt } from "./session-attempt";

const sessionQualityReadingSchema = z.discriminatedUnion("status", [
	z
		.object({ status: z.literal("GRADED"), verdict: z.enum(["PASS", "FAIL"]) })
		.strict(),
	z
		.object({
			detail: z.string().nonempty(),
			status: z.enum(["ERROR", "UNAVAILABLE"]),
		})
		.strict(),
]);

type SessionQualityReading = Immutable<
	z.infer<typeof sessionQualityReadingSchema>
>;

function sessionQualityReading(
	judge: SessionAttempt["judge"],
): SessionQualityReading | undefined {
	if (judge === undefined) {
		return undefined;
	}

	return judge.status === "GRADED"
		? { status: judge.status, verdict: judge.grade.verdict }
		: { detail: judge.detail, status: judge.status };
}

export { sessionQualityReadingSchema, sessionQualityReading };
export type { SessionQualityReading };
