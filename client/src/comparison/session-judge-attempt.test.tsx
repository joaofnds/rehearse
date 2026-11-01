import { describe, expect, it } from "bun:test";

import {
	ATTEMPTS,
	cell,
	graded,
	renderPairs,
} from "./attempt-pair-test-fixtures";
import AttemptPairs from "./attempt-pairs";

describe(AttemptPairs.name, () => {
	it("shows a quality failure beside recorded checks that passed", () => {
		renderPairs({
			attempts: {
				...ATTEMPTS,
				baseline: [
					{
						...graded({ grade: "A", ordinal: 1, words: 12 }),
						judge: { status: "GRADED", verdict: "FAIL" },
					},
				],
			},
			mode: "session",
		});

		const baseline = cell("Attempt 1", "Baseline (before)");
		expect(baseline).toHaveTextContent("Recorded checks passed");
		expect(baseline).toHaveTextContent(
			"Judge: FAIL (separate from recorded checks)",
		);
	});
});
