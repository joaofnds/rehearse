import { z } from "zod";

import type { Immutable } from "./contracts";
import { jsonObjectSchema } from "./json-value";

const CONTEXT_SOURCE_SCHEMA_VERSION = 1;

const rawRecordSchema = jsonObjectSchema;

const captureSchema = z
	.object({
		capturedAt: z.iso.datetime(),
		cliVersion: z.string().nonempty(),
		flags: z.array(z.string()),
		provider: z.string().nonempty(),
		telemetry: jsonObjectSchema,
	})
	.loose();

const sourceFilesSchema = z
	.object({
		coverage: z.array(rawRecordSchema),
		hooks: z.array(rawRecordSchema),
		otelLogs: z.array(rawRecordSchema),
		otelSpans: z.array(rawRecordSchema),
		rawApiBodies: z.array(rawRecordSchema),
		stream: z.array(rawRecordSchema),
		transcripts: z.record(z.string().nonempty(), z.array(rawRecordSchema)),
	})
	.strict();

const contextEvidenceSourceSchema = z
	.object({
		capture: captureSchema,
		files: sourceFilesSchema,
		kind: z.string().nonempty(),
		schemaVersion: z.literal(CONTEXT_SOURCE_SCHEMA_VERSION),
	})
	.strict();

type ContextEvidenceSource = Immutable<
	z.infer<typeof contextEvidenceSourceSchema>
>;

export { contextEvidenceSourceSchema as default };
export type { ContextEvidenceSource };
