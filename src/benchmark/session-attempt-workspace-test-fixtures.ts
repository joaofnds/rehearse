import { mkdir, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { SessionCase } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import type { SessionCorpusSnapshot } from "#benchmark/session-corpus";
import type { historyFixture } from "#benchmark/test-support";
import { TestResources } from "#benchmark/test-support";

import {
	SOURCE_SESSION,
	sessionCase,
} from "./session-attempt-case-test-fixtures";

const resources = new TestResources();

async function projectsRoot(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-attempt-projects-"));
	resources.track(directory);

	return directory;
}

async function recordDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-attempt-record-"));
	resources.track(directory);

	return directory;
}

async function snapshotHolding(
	layoutPath: string,
	contents: string,
): Promise<SessionCorpusSnapshot> {
	const root = await resources.createControlDirectory();
	await Bun.write(join(root, layoutPath), contents);

	return {
		declaredPaths: [layoutPath],
		kind: "directory",
		origin: { kind: "directory", source: root },
		root,
		scope: "declared",
	};
}

function resumingCase(
	transcriptPath: string,
	sha256: string,
	overrides: Immutable<Partial<SessionCase>> = {},
): SessionCase {
	const base = sessionCase({ transcriptPath, ...overrides });

	return {
		...base,
		declaration: {
			...base.declaration,
			checks: base.checks,
			transcript: {
				cut: 1,
				file: "prefix.jsonl",
				sha256,
				sourceSession: SOURCE_SESSION,
			},
		},
	};
}

async function writtenPrefix(text: string): Promise<PrefixOnDisk> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-prefix-"));
	resources.track(directory);
	const path = join(directory, "prefix.jsonl");
	await writeFile(path, text);

	return {
		path,
		sha256: new Bun.CryptoHasher("sha256").update(text).digest("hex"),
	};
}

interface PrefixOnDisk {
	readonly path: string;
	readonly sha256: string;
}

const GIT_HOOK_EXECUTABLE_MODE = 0o755;
interface HookedHistoryFixture {
	readonly fixture: Awaited<ReturnType<typeof historyFixture>>;
	readonly marker: string;
}

async function fixtureDirectory(
	files: Readonly<Record<string, string>> = {},
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-fixture-"));
	resources.track(directory);
	await Array.fromAsync(Object.entries(files), async ([path, contents]) => {
		await mkdir(dirname(join(directory, path)), { recursive: true });
		await writeFile(join(directory, path), contents);
	});

	return directory;
}
async function gitPointerFixture(): Promise<string> {
	return await fixtureDirectory({
		"dot-git": `gitdir: ${tmpdir()}\n`,
	});
}
async function hookedHistoryFixture(): Promise<HookedHistoryFixture> {
	const fixture = await resources.createHistory(["first"]);
	const marker = join(fixture.path, "hook-ran");
	const hooks = join(fixture.path, "dot-git", "hooks");
	await mkdir(hooks, { recursive: true });
	await writeFile(
		join(hooks, "post-index-change"),
		`#!/bin/sh\ntouch ${marker}\n`,
		{ mode: GIT_HOOK_EXECUTABLE_MODE },
	);

	return { fixture, marker };
}
async function escapingFixture(): Promise<string> {
	const fixture = await fixtureDirectory();
	await mkdir(join(fixture, "docs"), { recursive: true });
	await symlink("/etc/hosts", join(fixture, "docs", "escape.md"));

	return fixture;
}
async function attemptDirectories(): Promise<ReadonlySet<string>> {
	const entries = await readdir(tmpdir());
	return new Set(
		entries.filter((entry) => /^rehearse-attempt-[^-]+$/u.test(entry)),
	);
}

interface AttemptWorkspace {
	readonly projects: string;
	readonly records: string;
}
async function attemptWorkspace(): Promise<AttemptWorkspace> {
	return { projects: await projectsRoot(), records: await recordDirectory() };
}

export {
	attemptWorkspace,
	fixtureDirectory,
	gitPointerFixture,
	hookedHistoryFixture,
	escapingFixture,
	attemptDirectories,
	resources,
	projectsRoot,
	recordDirectory,
	snapshotHolding,
	resumingCase,
	writtenPrefix,
};
