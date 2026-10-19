import { describe, expect, it } from "bun:test";

import { corpusDifferences } from "./checkpoint";

const wording = {
	missingFromLeft: (path: string) => `${path} added`,
	missingFromRight: (path: string) => `${path} removed`,
	modified: (path: string) => `${path} changed`,
};

const file = { path: "a", sha256: "hash" } as const;

function testReportsPathUniqueDifferencesInSortedOrder(): void {
	const differences = corpusDifferences(
		[
			{ path: "b", sha256: "same" },
			{ path: "a", sha256: "old" },
		],
		[
			{ path: "c", sha256: "same" },
			{ path: "a", sha256: "new" },
		],
		wording,
	);

	expect(differences).toEqual(["a changed", "b removed", "c added"]);
}

function testRejectsADuplicatePathInTheLeftCorpus(): void {
	expect(() => corpusDifferences([file, file], [file], wording)).toThrow(
		/Duplicate corpus path: a/u,
	);
}

function testRejectsADuplicatePathInTheRightCorpus(): void {
	expect(() => corpusDifferences([file], [file, file], wording)).toThrow(
		/Duplicate corpus path: a/u,
	);
}

describe("corpus file differences", () => {
	it(
		"reports path-unique differences in sorted order",
		testReportsPathUniqueDifferencesInSortedOrder,
	);
	it(
		"rejects a duplicate path in the left corpus",
		testRejectsADuplicatePathInTheLeftCorpus,
	);
	it(
		"rejects a duplicate path in the right corpus",
		testRejectsADuplicatePathInTheRightCorpus,
	);
});
