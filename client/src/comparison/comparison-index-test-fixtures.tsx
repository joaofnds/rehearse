import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { renderAppWithStub } from "#client/test-support/render-app";

import type { ComparisonIndexResponse } from "./comparison-index-query";

const originalFetch = globalThis.fetch;

const DIGEST =
	"511cd2c4442b4bdcb0ee8be7b979ac5427e2d64a111b68f5253078abe3099ece";

const OTHER_DIGEST =
	"7e0f9a31c2d84b6e9f1a0c3b5d7e9f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e";

const CORRUPT_DIGEST = "a".repeat(SHA256_HEX_CHARACTERS);

const PARSE_ERROR = "JSON Parse error";

function indexWith(
	index: Partial<ComparisonIndexResponse>,
): ComparisonIndexResponse {
	return { comparisons: [], unreadable: [], ...index };
}

function savedComparison(
	digest: string,
): ComparisonIndexResponse["comparisons"][number] {
	return { caseIds: ["audit-log"], digest, mode: "session", reps: 2 };
}

function renderComparisonsAt(index: ComparisonIndexResponse): void {
	renderAppWithStub("/comparisons", new Map([["/api/comparisons", index]]));
}

function sharedCaseIndex(): ComparisonIndexResponse {
	const versions = {
		baseline: {
			digest: "a".repeat(SHA256_HEX_CHARACTERS),
			state: "available",
		},
		candidate: {
			digest: "b".repeat(SHA256_HEX_CHARACTERS),
			state: "available",
		},
		control: {
			digest: "c".repeat(SHA256_HEX_CHARACTERS),
			state: "available",
		},
	} as const;
	return indexWith({
		comparisons: [
			{
				...savedComparison(DIGEST),
				details: [
					{
						caseId: "audit-log",
						changedPaths: ["skills/review/SKILL.md"],
						corpusVersions: versions,
					},
				],
			},
			{
				...savedComparison(OTHER_DIGEST),
				details: [
					{
						caseId: "audit-log",
						changedPaths: ["skills/build/SKILL.md"],
						corpusVersions: {
							...versions,
							candidate: {
								digest: "d".repeat(SHA256_HEX_CHARACTERS),
								state: "available",
							},
						},
					},
				],
			},
		],
	});
}

export {
	CORRUPT_DIGEST,
	DIGEST,
	indexWith,
	originalFetch,
	OTHER_DIGEST,
	PARSE_ERROR,
	renderComparisonsAt,
	savedComparison,
	sharedCaseIndex,
};
