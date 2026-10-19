import { describe, expect, it } from "bun:test";

import {
	RefusedPreconditionError,
	requireInteractiveStdin,
} from "#cli/interactive-stdin";

describe(requireInteractiveStdin.name, () => {
	it("passes when stdin is a terminal", () => {
		expect(() => {
			requireInteractiveStdin(true, "the review pause needs a TTY");
		}).not.toThrow();
	});

	it("refuses with the stated reason when stdin is not a terminal", () => {
		expect(() => {
			requireInteractiveStdin(false, "the review pause needs a TTY");
		}).toThrow(
			new RefusedPreconditionError(
				"stdin is not a terminal: the review pause needs a TTY",
			),
		);
	});
});
