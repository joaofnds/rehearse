import type { z } from "zod";

type JsonDocument =
	| { readonly kind: "invalid-json"; readonly error: unknown }
	| { readonly kind: "document"; readonly value: unknown };

type ParsedJsonDocument<T> =
	| { readonly kind: "invalid-json"; readonly error: unknown }
	| {
			readonly kind: "parsed";
			readonly value: unknown;
			readonly parsed: z.ZodSafeParseResult<T>;
	  };

function decodeJsonDocument(text: string): JsonDocument {
	try {
		const value: unknown = JSON.parse(text);
		return { kind: "document", value };
	} catch (error) {
		return { error, kind: "invalid-json" };
	}
}

function parseJsonDocument<T>(
	text: string,
	schema: z.ZodType<T>,
): ParsedJsonDocument<T> {
	const document = decodeJsonDocument(text);
	if (document.kind === "invalid-json") {
		return document;
	}

	return {
		kind: "parsed",
		parsed: schema.safeParse(document.value),
		value: document.value,
	};
}

export { parseJsonDocument as default };
