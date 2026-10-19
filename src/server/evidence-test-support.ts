import { expect } from "bun:test";

import { SessionHistoryReaderError } from "./session-history-reader";

async function expectHistoryError<Value>(
	operation: Promise<Value>,
	kind: SessionHistoryReaderError["kind"],
): Promise<void> {
	try {
		await operation;
	} catch (error) {
		expect(error).toBeInstanceOf(SessionHistoryReaderError);
		if (error instanceof SessionHistoryReaderError) {
			expect(error.kind).toBe(kind);
		}
		return;
	}
	throw new Error(
		"The saved evidence reader unexpectedly accepted the request",
	);
}

export { expectHistoryError as default };
