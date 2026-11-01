import { describe, expect, it } from "bun:test";

import { parseRubricIds } from "./judge";
import {
	sessionReviewSchema,
	validateReviewRequirements,
} from "./session-review";

const SHA256_LENGTH = 64;

describe("session review", () => {
	it("preserves the exact IDs a saved rubric accepted", () => {
		const ids = parseRubricIds("1. ` accuracy `: The answer is accurate.");
		const review = sessionReviewSchema.parse({
			requirements: [{ id: " accuracy ", status: "PASS" }],
			sourceSha256: "a".repeat(SHA256_LENGTH),
			summary: "Reviewed.",
			verdict: "PASS",
		});

		expect(() => {
			validateReviewRequirements(review, ids);
		}).not.toThrow();
		expect(review.requirements.map(({ id }) => id)).toEqual(ids);
	});
});
