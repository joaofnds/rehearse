import { z } from "zod";

import type Harness from "#server/launch-http-test-driver";

const readingSchema = z.object({
	linkedCorpus: z.object({
		kind: z.enum(["live", "directory"]),
		root: z.string(),
	}),
	overrun: z.string(),
	recordsDirectory: z.string(),
	spendCeilingUsd: z.number().nullable(),
});

async function reading(
	get: Harness["get"],
): Promise<z.infer<typeof readingSchema>> {
	const response = await get("/api/settings");

	return readingSchema.parse(await response.json());
}

export { readingSchema, reading };
