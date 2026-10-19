import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import type { SessionCase } from "./case";
import type { ResolvedCorpusSource } from "./corpus-source";
import {
	declaredCorpusCase,
	frozenInputCase,
	simpleSessionCase,
} from "./session-confirmation-test-fixtures";
import {
	TestResources,
	budgetHaltEnvelope,
	historyFixture,
} from "./test-support";

async function historyFilePaths(
	fixturePath: string,
): Promise<readonly string[]> {
	const history = join(fixturePath, "dot-git");
	const entries = await readdir(history, {
		recursive: true,
		withFileTypes: true,
	});

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(relative(history, entry.parentPath), entry.name));
}

const resources = new TestResources();

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	resources.track(root);

	return root;
}

interface HostileCorpus {
	readonly root: string;
	readonly source: ResolvedCorpusSource;
	readonly sessionCase: SessionCase;
}

async function hostileCorpus(): Promise<HostileCorpus> {
	const root = await temporaryRoot("rehearse-session-live-");
	const source = {
		backingRoot: join(root, "backing"),
		kind: "live" as const,
		root: join(root, "install"),
	};
	await mkdir(join(source.root, "output-styles"), { recursive: true });
	await mkdir(source.backingRoot, { recursive: true });
	await mkdir(join(root, "outside"), { recursive: true });
	await Bun.write(join(root, "outside", "foreign.md"), "FOREIGN STYLE\n");
	await symlink(
		join(root, "outside", "foreign.md"),
		join(source.root, "output-styles", "foreign.md"),
	);

	return {
		root,
		sessionCase: declaredCorpusCase("hostile-live", [
			"output-styles/foreign.md",
		]),
		source,
	};
}

async function instructionCorpus(
	prefix: string,
	files: Readonly<Record<string, string>>,
): Promise<{ readonly root: string; readonly corpusRoot: string }> {
	const root = await temporaryRoot(prefix);
	const corpusRoot = join(root, "source-corpus");
	await Array.fromAsync(Object.entries(files), async ([path, content]) => {
		await mkdir(dirname(join(corpusRoot, path)), { recursive: true });
		await Bun.write(join(corpusRoot, path), content);
	});

	return { corpusRoot, root };
}

async function frozenInputWorkspace(): Promise<{
	readonly root: string;
	readonly corpusRoot: string;
	readonly fixturePath: string;
	readonly transcriptPath: string;
	readonly sessionCase: SessionCase;
}> {
	const root = await temporaryRoot("rehearse-session-group-");
	const corpusRoot = join(root, "source-corpus");
	const fixturePath = join(root, "source-fixture");
	const transcriptPath = join(root, "source-transcript.jsonl");
	await mkdir(join(corpusRoot, "output-styles"), { recursive: true });
	await mkdir(fixturePath, { recursive: true });
	await Bun.write(join(fixturePath, "fixture.txt"), "original fixture\n");
	await Bun.write(transcriptPath, "original transcript\n");
	await Bun.write(
		join(corpusRoot, "output-styles", "brief.md"),
		"original corpus\n",
	);

	return {
		corpusRoot,
		fixturePath,
		root,
		sessionCase: frozenInputCase(fixturePath, transcriptPath),
		transcriptPath,
	};
}

const PRIVATE_PREFIX_BYTES = "source-session PRIVATE PREFIX MARKER\n";

interface SymlinkedPrefixWorkspace {
	readonly root: string;
	readonly corpusRoot: string;
	readonly transcriptPath: string;
	readonly sessionCase: SessionCase;
}
async function symlinkedPrefixWorkspace(
	sha256: string,
): Promise<SymlinkedPrefixWorkspace> {
	const workspace = await frozenInputWorkspace();
	const outside = join(workspace.root, "private-prefix.jsonl");
	await Bun.write(outside, PRIVATE_PREFIX_BYTES);
	await rm(workspace.transcriptPath);
	await symlink(outside, workspace.transcriptPath);

	return {
		...workspace,
		sessionCase: {
			...workspace.sessionCase,
			declaration: {
				...workspace.sessionCase.declaration,
				transcript: {
					cut: 1,
					file: "prefix.jsonl",
					sha256,
					sourceSession: "source-session",
				},
			},
		},
	};
}

async function emptyCorpus(
	prefix: string,
): Promise<{ readonly root: string; readonly corpusRoot: string }> {
	const root = await temporaryRoot(prefix);
	const corpusRoot = join(root, "corpus");
	await mkdir(join(corpusRoot, "output-styles"), { recursive: true });

	return { corpusRoot, root };
}
async function historySessionWorkspace(): Promise<{
	readonly root: string;
	readonly corpusRoot: string;
	readonly fixture: Awaited<ReturnType<typeof historyFixture>>;
	readonly sessionCase: SessionCase;
}> {
	const workspace = await emptyCorpus("rehearse-session-history-");
	const fixture = await historyFixture(["first"]);
	resources.track(fixture.path);

	return {
		...workspace,
		fixture,
		sessionCase: { ...simpleSessionCase("history"), fixturePath: fixture.path },
	};
}
async function budgetSessionWorkspace(): Promise<{
	readonly root: string;
	readonly corpusRoot: string;
	readonly projectsDirectory: string;
	readonly halt: string;
}> {
	const workspace = await emptyCorpus("rehearse-session-halt-");
	const projectsDirectory = join(workspace.root, "projects");
	await mkdir(projectsDirectory);

	return { ...workspace, halt: await budgetHaltEnvelope(), projectsDirectory };
}

export {
	resources,
	temporaryRoot,
	hostileCorpus,
	instructionCorpus,
	frozenInputWorkspace,
	historyFilePaths,
	emptyCorpus,
	historySessionWorkspace,
	budgetSessionWorkspace,
	PRIVATE_PREFIX_BYTES,
	symlinkedPrefixWorkspace,
};
export type { HostileCorpus };
