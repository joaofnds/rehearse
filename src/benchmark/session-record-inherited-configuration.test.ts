import { describe, expect, it } from "bun:test";

import { sessionSetupRecordSchema } from "./session-record-context-schema";

describe("a session setup record's inherited configuration", () => {
	it("reads as unknown on a record written before it was recorded", () => {
		const setup = sessionSetupRecordSchema.parse({ kind: "isolated" });

		expect(setup.inheritedConfiguration).toBeUndefined();
	});

	it("reads as none on a record that inherited nothing", () => {
		const setup = sessionSetupRecordSchema.parse({
			inheritedConfiguration: [],
			kind: "isolated",
		});

		expect(setup.inheritedConfiguration).toEqual([]);
	});
});
