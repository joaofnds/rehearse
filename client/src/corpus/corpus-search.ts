import { z } from "zod";

/** A corpus destination can retain its source step and selected file lines. */
const corpusSearchSchema = z.object({
	end: z.coerce.number().int().positive().optional(),
	file: z.string().optional(),
	sourceRun: z.string().optional(),
	sourceStep: z.string().optional(),
	start: z.coerce.number().int().positive().optional(),
});

type CorpusSearch = z.output<typeof corpusSearchSchema>;

export { corpusSearchSchema as default };
export type { CorpusSearch };
