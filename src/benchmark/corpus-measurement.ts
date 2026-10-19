import { z } from "zod";

import type { Immutable } from "./contracts";

/**
 * What measuring a corpus source yields: the version its whole layout is, or
 * the refusal that kept it from being one. A refused layout still lets the
 * attempt run, and its record carries the refusal in place of a version.
 *
 * Records written before versions existed carry neither, so every record
 * field holding one is optional and reads as not recorded when absent.
 */
const corpusMeasurementSchema = z.discriminatedUnion("kind", [
	z.object({
		digest: z.string().regex(/^[0-9a-f]{64}$/u),
		kind: z.literal("version"),
	}),
	z.object({ kind: z.literal("refused"), refusal: z.string().nonempty() }),
]);

type CorpusMeasurement = Immutable<z.infer<typeof corpusMeasurementSchema>>;

export { corpusMeasurementSchema as default };
export type { CorpusMeasurement };
