import { describe, expect, it } from "bun:test";

import { corpusLayoutRoots, stageCorpusRoots } from "./checkpoint";

function testSearchesTheProjectLayoutRootBeforeTheUserS(): void {
	const source = {
		backingRoot: "/backing",
		kind: "live",
		root: "/install",
	} as const;

	expect(corpusLayoutRoots("/target", source)).toEqual([
		{ kind: "directory", root: "/target/.claude" },
		source,
	]);
}

function testSearchesProjectLevelBeforeUserLevelForTheLiveInstall(): void {
	const source = {
		backingRoot: "/backing",
		kind: "live",
		root: "/install",
	} as const;

	expect(stageCorpusRoots(source, "/target")).toEqual([
		{ kind: "directory", root: "/target/.claude" },
		source,
	]);
}

function testSearchesOnlyTheResolvedRootForADirectoryCorpus(): void {
	expect(
		stageCorpusRoots({ kind: "directory", root: "/variants/brief" }, "/target"),
	).toEqual([{ kind: "directory", root: "/variants/brief" }]);
}

describe("stage corpus search roots", () => {
	it(
		"searches the project layout root before the user's",
		testSearchesTheProjectLayoutRootBeforeTheUserS,
	);
	it(
		"searches project level before user level for the live install",
		testSearchesProjectLevelBeforeUserLevelForTheLiveInstall,
	);
	it(
		"searches only the resolved root for a directory corpus",
		testSearchesOnlyTheResolvedRootForADirectoryCorpus,
	);
});
