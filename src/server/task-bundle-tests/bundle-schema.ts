import { expect } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import type { Serving } from "#server/task-bundle-tests/bundle-server-fixture";

const exportedPipelineSchema = z.looseObject({
	stages: z.array(z.looseObject({})),
});

const bundleSchema = z.looseObject({
	caseId: z.string(),
	pipeline: exportedPipelineSchema,
	rubrics: z.record(z.string(), z.string()),
});

type ExportedBundle = z.infer<typeof bundleSchema>;

async function exported(server: Serving): Promise<ExportedBundle> {
	const response = await server.request("/api/cases/pipe-case/bundle");
	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

	return bundleSchema.parse(await response.json());
}

const refusalSchema = z.object({ error: z.string().nonempty() });

async function refusal(response: Response): Promise<string> {
	const body = refusalSchema.parse(await response.json());

	return body.error;
}

export { bundleSchema, exported, refusal };
