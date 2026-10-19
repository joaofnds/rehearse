import { describe, expect, it } from "bun:test";

import { parseSessionAttemptRecord } from "#benchmark/session-record";

import { savedAttempts } from "./session-record-test-fixtures";

describe("sessionAttemptRecordSchema", () => {
	for (const { name, schemaVersion } of savedAttempts) {
		it(`parses the saved attempt ${name} unchanged`, async () => {
			const text = await Bun.file(
				new URL(`__fixtures__/saved-attempts/${name}`, import.meta.url),
			).text();

			const parsed = parseSessionAttemptRecord(text);

			expect(parsed.schemaVersion).toBe(schemaVersion);
			expect(parsed.metrics?.modelUsage).toBeUndefined();
		});
	}
});
