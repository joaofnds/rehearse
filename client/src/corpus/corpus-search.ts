import { z } from "zod";

/** A corpus destination can retain its source step and selected file lines. */
export const corpusSearchSchema = z.object({
	sourceRun: z.string().optional(),
	sourceStep: z.string().optional(),
	file: z.string().optional(),
	start: z.coerce.number().int().positive().optional(),
	end: z.coerce.number().int().positive().optional(),
});

export type CorpusSearch = z.output<typeof corpusSearchSchema>;
