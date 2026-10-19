import { describe, expect, it } from "bun:test";

import { z } from "zod";

import parseJsonDocument from "./json-document";

describe(parseJsonDocument.name, () => {
	it("distinguishes JSON syntax errors from schema failures", () => {
		const syntax = parseJsonDocument("{", z.object({ name: z.string() }));
		const invalidDeclaration = parseJsonDocument(
			'{"name": 7}',
			z.object({ name: z.string() }),
		);

		expect(syntax).toHaveProperty("kind", "invalid-json");
		expect(syntax).toHaveProperty("error", expect.any(SyntaxError));
		expect(invalidDeclaration).toMatchObject({
			kind: "parsed",
			parsed: { success: false },
		});
	});

	it("retains the raw document alongside the validated value", () => {
		const result = parseJsonDocument(
			'{"name":"stage","extra":true}',
			z.object({ name: z.string().transform((name) => name.toUpperCase()) }),
		);

		expect(result).toEqual({
			kind: "parsed",
			parsed: { data: { name: "STAGE" }, success: true },
			value: { extra: true, name: "stage" },
		});
	});

	it("lets schema execution errors propagate", () => {
		const failure = new TypeError("schema execution failed");
		const schema = z.string().transform(() => {
			throw failure;
		});

		expect(() => parseJsonDocument('"input"', schema)).toThrow(failure);
	});
});
