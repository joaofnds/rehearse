import { describe, expect, it } from "bun:test";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import {
	CorpusConfigurationError,
	CorpusFileError,
	LIVE_CORPUS_BACKING_ROOT_ENV,
	hashCorpusFiles,
	liveCorpusRoot,
	liveCorpusSource,
	resolveCorpusFile,
} from "#benchmark/corpus-file";
import { SymlinkedEntryError } from "#benchmark/file-presence";
import { failureOf } from "#cli/cli-test-support";

import {
	configuredBackingCorpus,
	live,
	resources,
} from "./corpus-file-test-fixtures";

resources.registerCleanup();

function defaultsTheLiveExtentToTheInstallAndHomeAgentsTrees(): void {
	expect(liveCorpusSource({ env: {} })).toEqual({
		backingRoot: join(homedir(), ".agents"),
		kind: "live",
		root: join(homedir(), ".claude"),
	});
}

function usesTheExternallyConfiguredBackingRoot(): void {
	const backingRoot = join(tmpdir(), "configured-agents");

	expect(
		liveCorpusSource({
			env: { [LIVE_CORPUS_BACKING_ROOT_ENV]: backingRoot },
		}).backingRoot,
	).toBe(backingRoot);
}

function keepsTheBackingRootCapturedWhenTheEnvironmentChanges(): void {
	const original = join(tmpdir(), "original-agents");
	const changed = join(tmpdir(), "changed-agents");
	const env = {
		[LIVE_CORPUS_BACKING_ROOT_ENV]: original,
	} satisfies Record<string, string | undefined>;

	const source = liveCorpusSource({ env });

	env[LIVE_CORPUS_BACKING_ROOT_ENV] = changed;

	expect(source.backingRoot).toBe(original);
}

async function permitsOnlyTheConfiguredBackingTreeAfterAnExplicitOverride(): Promise<void> {
	const { root, configured } = await configuredBackingCorpus();

	const source = liveCorpusSource({ backingRoot: configured, root });

	const allowed = await hashCorpusFiles(source, ["output-styles/allowed.md"]);
	const refusal = await failureOf(
		hashCorpusFiles(source, ["output-styles/refused.md"]),
	);

	const [observedFirstAllowed] = allowed;

	expect(observedFirstAllowed?.sha256).toBe(
		new Bun.CryptoHasher("sha256").update("allowed\n").digest("hex"),
	);
	expect(refusal).toBeInstanceOf(SymlinkedEntryError);
}

function resolvesCLAUDEMdOntoTheInstallLikeEveryOtherCorpusKind(): void {
	expect(resolveCorpusFile(live, "CLAUDE.md")).toBe(
		join(liveCorpusRoot(), "CLAUDE.md"),
	);
}

function resolvesADirectorySourceSCLAUDEMdAtTheRootOfCorpusLayout(): void {
	expect(
		resolveCorpusFile(
			{ kind: "directory", root: "/variants/brief" },
			"CLAUDE.md",
		),
	).toBe("/variants/brief/CLAUDE.md");
}

function refusesAPathThatIsNotACorpusLayoutPathNamingIt(): void {
	expect(() => resolveCorpusFile(live, "docs/vision.md")).toThrow(
		"Corpus file docs/vision.md names no corpus layout path",
	);
}

function namesTheEscapingPathItRefuses(): void {
	expect(() => resolveCorpusFile(live, "agents/../../.ssh/id_rsa")).toThrow(
		"agents/../../.ssh/id_rsa",
	);
}

function resolvesALayoutPathWhoseSegmentsAreOrdinaryNames(): void {
	expect(resolveCorpusFile(live, "skills/build/references/core.md")).toBe(
		join(homedir(), ".claude/skills/build/references/core.md"),
	);
}

describe(liveCorpusSource.name, () => {
	it(
		"defaults the live extent to the install and home .agents trees",
		defaultsTheLiveExtentToTheInstallAndHomeAgentsTrees,
	);

	it(
		"uses the externally configured backing root",
		usesTheExternallyConfiguredBackingRoot,
	);

	it.each(["", "relative/agents", "/tmp/agents\0escape"])(
		"rejects invalid configured backing root %p",
		(backingRoot) => {
			expect(() =>
				liveCorpusSource({
					env: { [LIVE_CORPUS_BACKING_ROOT_ENV]: backingRoot },
				}),
			).toThrow(CorpusConfigurationError);
		},
	);

	it(
		"keeps the backing root captured when the environment changes",
		keepsTheBackingRootCapturedWhenTheEnvironmentChanges,
	);

	it(
		"permits only the configured backing tree after an explicit override",
		permitsOnlyTheConfiguredBackingTreeAfterAnExplicitOverride,
	);
});

describe(resolveCorpusFile.name, () => {
	it.each([
		[
			"output-styles/brief.md",
			join(homedir(), ".claude/output-styles/brief.md"),
		],
		["agents/reviewer.md", join(homedir(), ".claude/agents/reviewer.md")],
		["skills/build/SKILL.md", join(homedir(), ".claude/skills/build/SKILL.md")],
		[
			"rulebook/coding-style.md",
			join(homedir(), ".claude/rulebook/coding-style.md"),
		],
	])("resolves %s onto the install", (layoutPath, expected) => {
		expect(resolveCorpusFile(live, layoutPath)).toBe(expected);
	});

	it(
		"resolves CLAUDE.md onto the install, like every other corpus kind",
		resolvesCLAUDEMdOntoTheInstallLikeEveryOtherCorpusKind,
	);

	it(
		"resolves a directory source's CLAUDE.md at the root of corpus layout",
		resolvesADirectorySourceSCLAUDEMdAtTheRootOfCorpusLayout,
	);

	it(
		"refuses a path that is not a corpus layout path, naming it",
		refusesAPathThatIsNotACorpusLayoutPathNamingIt,
	);

	it.each([
		"skills/../../../../etc/passwd",
		"agents/../../.ssh/id_rsa",
		"output-styles/../../.claude.json",
		"skills/build/../../../../etc/hosts",
	])("refuses %s, which escapes the corpus install", (layoutPath) => {
		expect(() => resolveCorpusFile(live, layoutPath)).toThrow(CorpusFileError);
	});

	it("names the escaping path it refuses", namesTheEscapingPathItRefuses);

	it(
		"resolves a layout path whose segments are ordinary names",
		resolvesALayoutPathWhoseSegmentsAreOrdinaryNames,
	);
});
