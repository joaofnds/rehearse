import { z } from "zod";

/**
 * What a session case's `--settings` and `--agents` overlays are: arbitrary
 * JSON the provider reads, never a shape this harness interprets. Declaring it
 * as JSON rather than as a dictionary of unknowns keeps the contract honest —
 * the value is re-serialized verbatim and nothing here reaches into it.
 */
type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

const jsonArraySchema = z.array(jsonValueSchema);

type JsonObject = z.infer<typeof jsonObjectSchema>;

export { jsonValueSchema, jsonObjectSchema, jsonArraySchema };
export type { JsonValue, JsonObject };
