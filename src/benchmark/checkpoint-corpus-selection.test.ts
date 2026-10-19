import { describe, expect, it } from "bun:test";

import { captureStageCorpus } from "./checkpoint";
import {
	corpusRoots,
	corpusSources,
	installAgent,
	installOutputStyle,
	installRule,
	installSkill,
} from "./checkpoint-corpus-test-fixture";
import { TestResources } from "./test-support";

const HOME_CORPUS_ROOT_INDEX = 1;

const TARGET_CORPUS_ROOT_INDEX = 0;

const testResources = TestResources.forEachTest();

async function testHashesTheInstalledInstructionsAndEverySkillFile(): Promise<void> {
	const expectedSize = 3;

	const roots = await corpusRoots(testResources);
	await installSkill({
		body: "discuss skill",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "discuss",
	});

	const corpus = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources(roots),
	);

	expect(corpus.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"skills/discuss/SKILL.md",
		"skills/discuss/references/notes.md",
	]);
	expect(new Set(corpus.map(({ sha256 }) => sha256)).size).toBe(expectedSize);
}

async function testRecordsTheSameCorpusWhereverTheSameSkillFilesLive(): Promise<void> {
	const [targetRoot, homeRoot] = await corpusRoots(testResources);
	await Array.fromAsync([targetRoot, homeRoot], async (root) => {
		await installSkill({ body: "doctrine skill", root, skill: "doctrine" });
		await installSkill({ body: "discuss skill", root, skill: "discuss" });
	});

	const fromTarget = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources([targetRoot]),
	);
	const fromHome = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources([homeRoot]),
	);

	expect(fromTarget).toEqual(fromHome);
}

async function testPrefersTheFirstRootThatHasTheSkill(): Promise<void> {
	const roots = await corpusRoots(testResources);
	await installSkill({
		body: "doctrine skill",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "doctrine",
	});
	await installSkill({
		body: "target copy",
		root: roots[TARGET_CORPUS_ROOT_INDEX],
		skill: "discuss",
	});
	await installSkill({
		body: "home copy",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "discuss",
	});

	const corpus = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources(roots),
	);
	const homeOnly = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources([roots[HOME_CORPUS_ROOT_INDEX]]),
	);

	expect(corpus).not.toEqual(homeOnly);
}

async function testFailsNamingTheSkillAndTheSearchedRootsWhenNoneHasIt(): Promise<void> {
	const roots = await corpusRoots(testResources);

	expect(
		captureStageCorpus("discuss", "instructions", corpusSources(roots)),
	).rejects.toThrow(/discuss.*not installed/u);
}

async function testHashesEveryAgentAndOutputStyleFileProjectRootFirst(): Promise<void> {
	const roots = await corpusRoots(testResources);
	await installSkill({
		body: "discuss skill",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "discuss",
	});
	await installAgent({
		agent: "reviewer",
		body: "reviewer agent",
		root: roots[HOME_CORPUS_ROOT_INDEX],
	});
	await installOutputStyle({
		body: "brief style",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		style: "brief",
	});

	const corpus = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources(roots),
	);

	expect(corpus.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"agents/reviewer.md",
		"output-styles/brief.md",
		"skills/discuss/SKILL.md",
		"skills/discuss/references/notes.md",
	]);
}

async function testPrefersTheProjectRootSWholeAgentsDirectoryOverTheUserS(): Promise<void> {
	const roots = await corpusRoots(testResources);
	await installSkill({
		body: "discuss skill",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "discuss",
	});
	await installAgent({
		agent: "reviewer",
		body: "project reviewer",
		root: roots[TARGET_CORPUS_ROOT_INDEX],
	});
	await installAgent({
		agent: "reviewer",
		body: "user reviewer",
		root: roots[HOME_CORPUS_ROOT_INDEX],
	});
	await installAgent({
		agent: "other",
		body: "user-only agent",
		root: roots[HOME_CORPUS_ROOT_INDEX],
	});

	const corpus = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources(roots),
	);

	const agentFiles = corpus.filter(({ path }) => path.startsWith("agents/"));
	expect(agentFiles.map(({ path }) => path)).toEqual(["agents/reviewer.md"]);
}

async function testHashesEveryRuleFileSoAnEditToOneChangesTheCorpus(): Promise<void> {
	const roots = await corpusRoots(testResources);
	await installSkill({
		body: "discuss skill",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "discuss",
	});
	await installRule({
		body: "the doctrine",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		rule: "doctrine",
	});

	const before = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources(roots),
	);

	await installRule({
		body: "the doctrine, revised",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		rule: "doctrine",
	});

	const after = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources(roots),
	);

	expect(before.some(({ path }) => path === "rulebook/doctrine.md")).toBe(true);
	expect(after).not.toEqual(before);
}

async function testCapturesNoAgentsOrOutputStylesWhenNeitherRootHasThem(): Promise<void> {
	const roots = await corpusRoots(testResources);
	await installSkill({
		body: "discuss skill",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "discuss",
	});

	const corpus = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources(roots),
	);

	expect(corpus.some(({ path }) => path.startsWith("agents/"))).toBe(false);
	expect(corpus.some(({ path }) => path.startsWith("output-styles/"))).toBe(
		false,
	);
}

describe("stage corpus selection", () => {
	it(
		"hashes the installed instructions and every skill file",
		testHashesTheInstalledInstructionsAndEverySkillFile,
	);
	it(
		"records the same corpus wherever the same skill files live",
		testRecordsTheSameCorpusWhereverTheSameSkillFilesLive,
	);
	it(
		"prefers the first root that has the skill",
		testPrefersTheFirstRootThatHasTheSkill,
	);
	it(
		"fails naming the skill and the searched roots when none has it",
		testFailsNamingTheSkillAndTheSearchedRootsWhenNoneHasIt,
	);
	it(
		"hashes every agent and output style file, project root first",
		testHashesEveryAgentAndOutputStyleFileProjectRootFirst,
	);
	it(
		"prefers the project root's whole agents directory over the user's",
		testPrefersTheProjectRootSWholeAgentsDirectoryOverTheUserS,
	);
	it(
		"hashes every rule file, so an edit to one changes the corpus",
		testHashesEveryRuleFileSoAnEditToOneChangesTheCorpus,
	);
	it(
		"captures no agents or output styles when neither root has them",
		testCapturesNoAgentsOrOutputStylesWhenNeitherRootHasThem,
	);
});
