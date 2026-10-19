import { chmod, link, lstat, mkdir, readFile, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import parseShortAppendReport from "./backlog-excludes-process-fixture";
import type {
	ExcludeReaderRequest,
	ExcludeShortAppendReport,
	ExcludeShortAppendRequest,
} from "./backlog-excludes-process-fixture";
import {
	createBacklogTarget,
	createLinkedBacklogWorktree,
	removeBoardIgnores,
} from "./backlog-test-support";
import { runCommand } from "./command";
import type { TestResources } from "./test-support";

const CHILD_TIMEOUT_MS = 3000;
const SUCCESS_EXIT_STATUS = 0;
const WRITABLE_EXCLUDE_MODE = 0o640;
const readerScript = join(
	import.meta.dir,
	"backlog-excludes-process-fixture.ts",
);
const LEFT_PATTERNS = ["/backlog.config.yml", "/board-left/"];
const RIGHT_PATTERNS = ["/backlog.config.yml", "/board-right/"];

class ExcludeAppendReaders {
	private readonly children: Bun.Subprocess<"pipe", "pipe", "pipe">[] = [];

	public async shortAppend(
		request: ExcludeShortAppendRequest,
	): Promise<ExcludeShortAppendReport> {
		const child = Bun.spawn(
			[
				"/bin/sh",
				"-c",
				'ulimit -f 1; exec "$@"',
				"append-probe",
				process.execPath,
				readerScript,
				JSON.stringify(request),
				"report-short-append",
			],
			{
				env: { ...Bun.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
				stderr: "pipe",
				stdin: "pipe",
				stdout: "pipe",
				timeout: CHILD_TIMEOUT_MS,
			},
		);
		this.children.push(child);
		await child.stdin.end();

		const [exitStatus, output, errors] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		if (exitStatus !== SUCCESS_EXIT_STATUS) {
			throw new Error(errors);
		}

		return parseShortAppendReport(output);
	}

	public async capture(request: ExcludeReaderRequest): Promise<void> {
		const child = Bun.spawn(
			[process.execPath, readerScript, JSON.stringify(request)],
			{
				env: Bun.env,
				stderr: "pipe",
				stdin: "pipe",
				stdout: "pipe",
				timeout: CHILD_TIMEOUT_MS,
			},
		);
		this.children.push(child);

		const reader = child.stdout.getReader();
		try {
			const { done } = await reader.read();
			if (done) {
				throw new Error(await new Response(child.stderr).text());
			}
		} finally {
			reader.releaseLock();
		}
	}

	public async append(): Promise<void> {
		await Promise.all(
			this.children.map(async (child) => {
				await child.stdin.end();
				const exitStatus = await child.exited;
				if (exitStatus !== SUCCESS_EXIT_STATUS) {
					throw new Error(await new Response(child.stderr).text());
				}
			}),
		);
	}

	public async stop(): Promise<void> {
		for (const child of this.children) {
			child.kill("SIGKILL");
		}

		await Promise.all(
			this.children.map(async (child) => {
				await child.exited;
			}),
		);
	}

	public async [Symbol.asyncDispose](): Promise<void> {
		await this.stop();
	}
}

interface ExcludeAppendFixture {
	readonly excludePath: string;
	readonly linked: string;
	readonly primary: string;
}

interface WorkflowBoardFixture {
	readonly board: string;
	readonly directory: string;
}

async function prepareBoard({
	directory,
	board,
}: WorkflowBoardFixture): Promise<void> {
	await mkdir(join(directory, board, "tasks"), { recursive: true });

	await Bun.write(
		join(directory, board, "tasks", "TASK-1.md"),
		"owned workflow\n",
	);

	await Bun.write(
		join(directory, "backlog.config.yml"),
		`backlog_directory: "${board}"\n`,
	);
}

async function createExcludeFixture(
	resources: Readonly<TestResources>,
	prefix: Readonly<Buffer>,
): Promise<ExcludeAppendFixture> {
	const target = await createBacklogTarget(resources);
	await removeBoardIgnores(target.directory);
	const linked = await createLinkedBacklogWorktree(resources, target.directory);
	const excludePath = join(target.directory, ".git", "info", "exclude");
	await Bun.write(excludePath, prefix);
	await Promise.all([
		prepareBoard({ board: "board-left", directory: target.directory }),
		prepareBoard({ board: "board-right", directory: linked }),
	]);

	return { excludePath, linked, primary: target.directory };
}

function snapshotPaths(
	fixture: ExcludeAppendFixture,
): readonly [string, string] {
	return [
		join(dirname(fixture.excludePath), "left.snapshot"),
		join(dirname(fixture.excludePath), "right.snapshot"),
	];
}

async function captureBothReaders(
	readers: Readonly<ExcludeAppendReaders>,
	fixture: ExcludeAppendFixture,
): Promise<void> {
	const [left, right] = snapshotPaths(fixture);

	await Promise.all([
		readers.capture({
			excludePath: fixture.excludePath,
			missing: LEFT_PATTERNS,
			snapshotPath: left,
		}),
		readers.capture({
			excludePath: fixture.excludePath,
			missing: RIGHT_PATTERNS,
			snapshotPath: right,
		}),
	]);
}

async function capturedBytes(
	fixture: ExcludeAppendFixture,
): Promise<readonly Buffer[]> {
	return await Promise.all(
		snapshotPaths(fixture).map(async (path) => {
			const bytes = await Bun.file(path).bytes();
			return Buffer.from(bytes);
		}),
	);
}

async function rootedPatterns(path: string): Promise<readonly string[]> {
	const text = await readFile(path, "utf8");

	return [
		...new Set(text.split("\n").filter((line) => line.startsWith("/"))),
	].toSorted();
}

async function worktreeStatuses(
	fixture: ExcludeAppendFixture,
): Promise<readonly string[]> {
	return await Promise.all(
		[fixture.primary, fixture.linked].map(
			async (directory) =>
				await runCommand(
					["git", "status", "--porcelain", "--untracked-files=all"],
					directory,
				),
		),
	);
}

async function excludeMetadata(path: string): Promise<{
	readonly gid: number;
	readonly ino: number;
	readonly mode: number;
	readonly uid: number;
}> {
	const state = await lstat(path);

	return { gid: state.gid, ino: state.ino, mode: state.mode, uid: state.uid };
}

async function excludeAlias(
	path: string,
	kind: "regular" | "symlink" | "hardlink",
): Promise<string> {
	await chmod(path, WRITABLE_EXCLUDE_MODE);
	const alias = `${path}.alias`;
	if (kind === "symlink") {
		await symlink(path, alias);
		return alias;
	}

	if (kind === "hardlink") {
		await link(path, alias);
		return alias;
	}

	return path;
}

export {
	ExcludeAppendReaders,
	captureBothReaders,
	capturedBytes,
	createExcludeFixture,
	excludeAlias,
	excludeMetadata,
	rootedPatterns,
	worktreeStatuses,
};
