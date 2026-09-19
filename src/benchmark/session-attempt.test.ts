import { describe, expect, it } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	realpath,
	rename,
	rm,
	rmdir,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { SessionCase } from "#benchmark/case";
import { CommandError, runCommand } from "#benchmark/command";
import type { Immutable } from "#benchmark/contracts";
import { contextEvidenceSourceSchema } from "#benchmark/context-evidence";
import type { ContextEvidenceSource } from "#benchmark/context-evidence";
import { projectSlug } from "#benchmark/session-capture";
import { failureOf } from "#cli/cli-test-support";
import type { SessionCorpusSnapshot } from "#benchmark/session-corpus";
import { TestResources } from "#benchmark/test-support";
import type { SessionAttemptRequest } from "#benchmark/session-attempt";
import {
	forkTranscript,
	runSessionAttempt,
	sessionCaseArgs,
	SessionInputError,
} from "#benchmark/session-attempt";
import { SessionInvocationError } from "#benchmark/session-invocation-error";

const resources = TestResources.forEachTest();

const SOURCE_SESSION = "11111111-1111-1111-1111-111111111111";
const WRITTEN_SESSION = "99999999-9999-9999-9999-999999999999";

async function contextEvidenceSource(): Promise<ContextEvidenceSource> {
	return contextEvidenceSourceSchema.parse(
		await Bun.file(
			new URL("__fixtures__/context-evidence-source.json", import.meta.url),
		).json(),
	);
}

function envelope(result: string): string {
	return JSON.stringify({
		type: "result",
		subtype: "success",
		session_id: WRITTEN_SESSION,
		is_error: false,
		result,
		total_cost_usd: 0.0012,
		num_turns: 1,
		duration_ms: 900,
		duration_api_ms: 800,
		usage: {
			input_tokens: 12,
			output_tokens: 3,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 0,
		},
	});
}

function transcriptLine(sessionId: string, text: string): string {
	return JSON.stringify({
		type: "assistant",
		sessionId,
		message: { content: [{ type: "text", text }] },
	});
}

function toolUseLine(sessionId: string): string {
	return JSON.stringify({
		type: "assistant",
		sessionId,
		message: {
			content: [{ type: "tool_use", name: "Bash", input: {} }],
		},
	});
}

function bashToolUseLine(
	sessionId: string,
	id: string,
	command: string,
): string {
	return JSON.stringify({
		type: "assistant",
		sessionId,
		message: {
			content: [{ type: "tool_use", id, name: "Bash", input: { command } }],
		},
	});
}

function toolResultLine(id: string, isError = false): string {
	return JSON.stringify({
		type: "user",
		message: {
			content: [{ type: "tool_result", tool_use_id: id, is_error: isError }],
		},
	});
}

function readFileLine(sessionId: string, filePath: string): string {
	return JSON.stringify({
		type: "assistant",
		sessionId,
		message: {
			content: [
				{ type: "tool_use", name: "Read", input: { file_path: filePath } },
			],
		},
	});
}

function skillUseLine(sessionId: string, skill: string): string {
	return JSON.stringify({
		type: "assistant",
		sessionId,
		message: {
			content: [{ type: "tool_use", name: "Skill", input: { skill } }],
		},
	});
}

function outputStyleLine(style: string): string {
	return JSON.stringify({
		type: "attachment",
		attachment: { type: "output_style", style },
	});
}

function sessionCase(
	overrides: Immutable<Partial<SessionCase>> = {},
): SessionCase {
	return {
		kind: "session",
		declaration: {
			id: "probe",
			kind: "session",
			title: "Probe",
			prompt: "Reply with the single word OK.",
			tools: [],
			corpusFiles: [],
			projectFiles: [],
			checks: [{ kind: "word-band", max: 1 }],
		},
		fixturePath: undefined,
		transcriptPath: undefined,
		prompt: "Reply with the single word OK.",
		tools: [],
		settings: undefined,
		agents: undefined,
		corpusFiles: [],
		projectFiles: [],
		checks: [{ kind: "word-band", max: 1 }],
		...overrides,
	};
}

interface FakeRun {
	readonly command: readonly string[];
	readonly cwd: string;
	readonly seenFiles: readonly string[];
	readonly shellOutputs: readonly string[];
}

function namedSession(command: readonly string[]): string {
	const named = command.indexOf("--session-id");

	return (
		command[(named === -1 ? command.indexOf("--resume") : named) + 1] ?? ""
	);
}

/**
 * The provider writes the session file under the id the command line named it,
 * and the harness reads it back from the slug directory, so the fake does the
 * same. Nothing here depends on where that name sorts among the directory's
 * other entries. A case can also hand it commands to run where the harness
 * dropped it, standing in for a session that inspects the tree it was given.
 */
class FakeClaude {
	private readonly calls: FakeRun[] = [];

	public constructor(
		private readonly projects: string,
		private readonly reply: string,
		private readonly shellCommands: readonly (readonly string[])[] = [],
	) {}

	public get runs(): readonly FakeRun[] {
		return this.calls;
	}

	public readonly run: SessionAttemptRequest["runClaude"] = async (
		command,
		cwd,
	) => {
		this.calls.push({
			command: [...command],
			cwd,
			seenFiles: await readdir(cwd, { recursive: true }),
			shellOutputs: await this.shell(cwd),
		});
		const sessionId = namedSession(command);
		const slug = join(this.projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${transcriptLine(sessionId, this.reply)}\n`,
		);

		return envelope(this.reply);
	};

	private async shell(cwd: string): Promise<readonly string[]> {
		const outputs: string[] = [];
		for (const each of this.shellCommands) {
			outputs.push(await runCommand(each, cwd));
		}

		return outputs;
	}
}

interface GitFixture {
	readonly path: string;
	readonly commits: readonly [string, string];
}

async function gitFixture(
	options: { readonly packed?: boolean } = {},
): Promise<GitFixture> {
	const build = await mkdtemp(join(tmpdir(), "rehearse-fixture-build-"));
	resources.track(build);
	await runCommand(["git", "init", "--initial-branch=main"], build);
	await runCommand(["git", "config", "user.name", "Fixture Author"], build);
	await runCommand(
		["git", "config", "user.email", "fixture@example.com"],
		build,
	);

	const commits: string[] = [];
	for (const subject of ["first", "second"]) {
		await writeFile(join(build, `${subject}.md`), `${subject}\n`);
		await runCommand(["git", "add", "."], build);
		await runCommand(["git", "commit", "-m", subject], build);
		const head = await runCommand(["git", "rev-parse", "HEAD"], build);
		commits.push(head.trim());
	}
	if (options.packed === true) {
		await runCommand(["git", "pack-refs", "--all"], build);
	}

	await rename(join(build, ".git"), join(build, "dot-git"));
	await dropEmptyDirectories(join(build, "dot-git"));

	return { path: build, commits: [commits[0] ?? "", commits[1] ?? ""] };
}

/**
 * A case's fixture reaches a run as bytes git checked out, and git stores no
 * empty directory, so a fixture built in place only matches a committed one
 * once the directories a commit would have dropped are gone.
 */
async function dropEmptyDirectories(root: string): Promise<void> {
	const entries = await readdir(root, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory()) {
			await dropEmptyDirectories(join(root, entry.name));
		}
	}

	const remaining = await readdir(root);
	if (remaining.length === 0) {
		await rmdir(root);
	}
}

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

function request(
	overrides: Immutable<Partial<SessionAttemptRequest>> & {
		readonly projectsDirectory: string;
		readonly recordDirectory: string;
		readonly runClaude: SessionAttemptRequest["runClaude"];
	},
): SessionAttemptRequest {
	return {
		sessionCase: sessionCase(),
		settings: { model: "haiku", effort: "low", budgetUsd: 0.2 },
		...overrides,
	};
}

describe(sessionCaseArgs.name, () => {
	const settings = { model: "haiku", effort: "low", budgetUsd: 0.2 } as const;

	function args(
		overrides: Immutable<Partial<SessionCase>> = {},
		resume?: string,
	): readonly string[] {
		return sessionCaseArgs(
			sessionCase(overrides),
			settings,
			resume === undefined
				? { sessionId: WRITTEN_SESSION, resumed: false }
				: { sessionId: resume, resumed: true },
		);
	}

	function valueAfter(
		flags: readonly string[],
		flag: string,
	): string | undefined {
		const index = flags.indexOf(flag);

		return index === -1 ? undefined : flags[index + 1];
	}

	it("disables every tool with an empty --tools for an empty declared list", () => {
		expect(valueAfter(args(), "--tools")).toBe("");
	});

	it("joins the declared tool names into one --tools value", () => {
		expect(valueAfter(args({ tools: ["Read", "Bash"] }), "--tools")).toBe(
			"Read,Bash",
		);
	});

	it("passes the declared settings as inline JSON", () => {
		const flags = args({ settings: { outputStyle: "brief" } });

		expect(valueAfter(flags, "--settings")).toBe('{"outputStyle":"brief"}');
	});

	it("omits --settings when the case declares none", () => {
		expect(args()).not.toContain("--settings");
	});

	it("passes the declared agents as inline JSON", () => {
		const flags = args({ agents: { reviewer: { description: "r" } } });

		expect(valueAfter(flags, "--agents")).toBe(
			'{"reviewer":{"description":"r"}}',
		);
	});

	it("omits --agents when the case declares none", () => {
		expect(args()).not.toContain("--agents");
	});

	/**
	 * A case that edits a file and runs a CLI needs two independent grants, and
	 * `--setting-sources project` means the operator's own settings supply
	 * neither: `--tools` admits the tool, and the declared `settings` carry the
	 * permission. Both are the case's own declaration, so an unrelated machine
	 * default cannot decide whether the case can execute, and two arms differ in
	 * what they may do only where their declarations differ.
	 */
	it("carries a declared file-edit and CLI permission alongside the tools that use them", () => {
		const flags = args({
			tools: ["Edit", "Bash"],
			settings: {
				permissions: { allow: ["Edit", "Bash(./fixture-cli:*)"] },
			},
		});

		expect(valueAfter(flags, "--tools")).toBe("Edit,Bash");
		expect(valueAfter(flags, "--settings")).toBe(
			'{"permissions":{"allow":["Edit","Bash(./fixture-cli:*)"]}}',
		);
		expect(valueAfter(flags, "--setting-sources")).toBe("project");
	});

	/**
	 * Without this flag a same-named user-level skill wins over the overlay the
	 * harness installs, so a case declaring a skill would be measured against the
	 * operator's install. It is passed for every session case, not only skill-
	 * declaring ones, because two classes of case with different isolation is the
	 * drift that fixed experiment inputs exist to prevent.
	 */
	it("excludes the operator's own settings with --setting-sources project", () => {
		expect(valueAfter(args(), "--setting-sources")).toBe("project");
	});

	it("carries the session knobs, the JSON envelope, and the budget", () => {
		const flags = args();

		expect(valueAfter(flags, "--model")).toBe("haiku");
		expect(valueAfter(flags, "--effort")).toBe("low");
		expect(valueAfter(flags, "--max-budget-usd")).toBe("0.2");
		expect(valueAfter(flags, "--output-format")).toBe("json");
	});

	it("resumes the forked session when a transcript is declared", () => {
		expect(valueAfter(args({}, "fresh-uuid"), "--resume")).toBe("fresh-uuid");
	});

	it("rerenders the system prompt when resuming a forked session", () => {
		expect(valueAfter(args({}, "fresh-uuid"), "--system-prompt-snapshot")).toBe(
			"off",
		);
	});

	it("omits --resume when no transcript is declared", () => {
		expect(args()).not.toContain("--resume");
	});

	it("does not configure prompt snapshots for a fresh session", () => {
		expect(args()).not.toContain("--system-prompt-snapshot");
	});

	it("names the session it is about to create when no transcript is declared", () => {
		expect(valueAfter(args(), "--session-id")).toBe(WRITTEN_SESSION);
	});

	it("omits --session-id when it resumes a forked session instead", () => {
		expect(args({}, "fresh-uuid")).not.toContain("--session-id");
	});

	it.each(["--no-session-persistence", "--json-schema"])(
		"never passes %s, which would discard the transcript or force a schema",
		(flag) => {
			expect(
				args({ tools: ["Read"], settings: { style: "brief" } }, "uuid"),
			).not.toContain(flag);
		},
	);
});

describe("the corpus overlay a session attempt installs", () => {
	async function snapshotHolding(
		layoutPath: string,
		contents: string,
	): Promise<SessionCorpusSnapshot> {
		const root = await resources.createControlDirectory();
		await Bun.write(join(root, layoutPath), contents);

		return {
			kind: "directory",
			root,
			origin: { kind: "directory", source: root },
			declaredPaths: [layoutPath],
		};
	}

	it("places the snapshot's output style where the session reads it", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
				corpusSnapshot: await snapshotHolding(
					"output-styles/brief.md",
					"marker style\n",
				),
			}),
		);

		expect(claude.runs[0]?.seenFiles).toContain(
			join(".claude", "output-styles", "brief.md"),
		);
	});

	it("selects the snapshot's output style with --settings", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
				corpusSnapshot: await snapshotHolding(
					"output-styles/brief.md",
					"marker style\n",
				),
			}),
		);

		const command = claude.runs[0]?.command ?? [];
		expect(
			JSON.parse(command[command.indexOf("--settings") + 1] ?? "{}"),
		).toEqual({ outputStyle: "brief" });
	});

	it("merges the style selection over the case's declared settings rather than replacing them", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		await runSessionAttempt(
			request({
				sessionCase: sessionCase({
					settings: { permissions: { defaultMode: "plan" } },
				}),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
				corpusSnapshot: await snapshotHolding(
					"output-styles/brief.md",
					"marker style\n",
				),
			}),
		);

		const command = claude.runs[0]?.command ?? [];
		expect(
			JSON.parse(command[command.indexOf("--settings") + 1] ?? "{}"),
		).toEqual({
			permissions: { defaultMode: "plan" },
			outputStyle: "brief",
		});
	});

	/**
	 * A corpus holds files no case declared, and the whole point of `--corpus` is
	 * a second style: selecting the first one found would run the attempt against
	 * a style the case never named while recording the declared one in lineage.
	 */
	it("selects and installs only the style the case declared, never a second one the corpus holds", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");
		const root = await resources.createControlDirectory();
		await Bun.write(join(root, "output-styles/aardvark.md"), "undeclared\n");
		await Bun.write(join(root, "output-styles/brief.md"), "declared\n");

		await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
				corpusSnapshot: {
					kind: "directory",
					root,
					origin: { kind: "directory", source: root },
					declaredPaths: ["output-styles/brief.md"],
				},
			}),
		);

		const command = claude.runs[0]?.command ?? [];
		expect(
			JSON.parse(command[command.indexOf("--settings") + 1] ?? "{}"),
		).toEqual({ outputStyle: "brief" });
		expect(claude.runs[0]?.seenFiles).toContain(
			join(".claude", "output-styles", "brief.md"),
		);
		expect(claude.runs[0]?.seenFiles).not.toContain(
			join(".claude", "output-styles", "aardvark.md"),
		);
	});

	it("leaves the attempt directory bare when the corpus is the live install", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
			}),
		);

		expect(claude.runs[0]?.seenFiles).toEqual([]);
		expect(claude.runs[0]?.command).not.toContain("--settings");
	});
});

describe(forkTranscript.name, () => {
	it("rewrites every occurrence of the source session id and changes nothing else", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-fork-"));
		resources.track(directory);
		const source = join(directory, "source.jsonl");
		const forked = join(directory, "forked.jsonl");
		const bytes = [
			transcriptLine(SOURCE_SESSION, "first"),
			transcriptLine(SOURCE_SESSION, "second"),
		].join("\n");
		await writeFile(source, `${bytes}\n`);

		await forkTranscript(source, forked, SOURCE_SESSION, "fresh-uuid");

		expect(await Bun.file(forked).text()).toBe(
			`${bytes.replaceAll(SOURCE_SESSION, "fresh-uuid")}\n`,
		);
	});

	it("keeps a source that ends without a newline ending without one", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-fork-"));
		resources.track(directory);
		const source = join(directory, "source.jsonl");
		const forked = join(directory, "forked.jsonl");
		const bytes = [
			transcriptLine(SOURCE_SESSION, "first"),
			transcriptLine(SOURCE_SESSION, "second"),
		].join("\n");
		await writeFile(source, bytes);

		await forkTranscript(source, forked, SOURCE_SESSION, "fresh-uuid");

		expect(await Bun.file(forked).text()).toBe(
			bytes.replaceAll(SOURCE_SESSION, "fresh-uuid"),
		);
	});
});

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
				file: "prefix.jsonl",
				sha256,
				sourceSession: SOURCE_SESSION,
				cut: 1,
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

/**
 * A resumed headless session keeps its session id and appends to the file it
 * resumed, so the slug listing gains no entry and the transcript to read back
 * is the forked file itself. Observed on claude 2.1.258.
 */
function appendingClaude(
	projects: string,
	reply: string,
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		const resumed = command[command.indexOf("--resume") + 1] ?? "";

		const slug = join(projects, projectSlug(await realpath(cwd)));
		const file = join(slug, `${resumed}.jsonl`);
		await writeFile(
			file,
			`${await Bun.file(file).text()}${transcriptLine(resumed, reply)}\n`,
		);

		return envelope(reply);
	};
}

/**
 * A fresh session's transcript is whatever the provider writes, so a manifest
 * test needs the lines a real one would emit for a skill invocation or an
 * output style before the reply, not just the reply line `FakeClaude` writes.
 */
function claudeWriting(
	projects: string,
	extraLines: (sessionId: string) => readonly string[],
	reply: string,
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		const sessionId = namedSession(command);
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${[...extraLines(sessionId), transcriptLine(sessionId, reply)].join("\n")}\n`,
		);

		return envelope(reply);
	};
}

describe(runSessionAttempt.name, () => {
	it("runs in a fresh directory that is neither the control repository nor the case directory", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
			}),
		);

		const [only] = claude.runs;
		expect(only?.cwd).not.toBe(resolve(import.meta.dir, "../.."));
		expect(only?.cwd).not.toContain("/cases/");
	});

	it("seeds the attempt directory from the case's fixture tree", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "rehearse-fixture-"));
		resources.track(fixture);
		await mkdir(join(fixture, "docs"), { recursive: true });
		await writeFile(join(fixture, "docs", "note.md"), "planted\n");
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		await runSessionAttempt(
			request({
				sessionCase: sessionCase({ fixturePath: fixture }),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
			}),
		);

		const [only] = claude.runs;
		expect(only?.seenFiles).toContain(join("docs", "note.md"));
	});

	it("seeds a fixture's dot-git as a working git directory the session can read", async () => {
		const fixture = await gitFixture();
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK", [
			["git", "log", "--format=%H %s"],
			["git", "status", "--short"],
		]);

		await runSessionAttempt(
			request({
				sessionCase: sessionCase({ fixturePath: fixture.path }),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
			}),
		);

		expect(claude.runs[0]?.shellOutputs).toEqual([
			`${fixture.commits[1]} second\n${fixture.commits[0]} first\n`,
			"",
		]);
	});

	/**
	 * A packed fixture carries its branch in `packed-refs` and no file under
	 * `refs/heads/`, so a commit drops the directory entirely. Git then declines
	 * to read the seeded directory as a repository and searches upward, and the
	 * session gets whatever history encloses the attempt directory.
	 */
	it("reports a packed fixture's own commits rather than an enclosing repository's", async () => {
		const fixture = await gitFixture({ packed: true });
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK", [
			["git", "log", "--format=%H"],
		]);

		await runSessionAttempt(
			request({
				sessionCase: sessionCase({ fixturePath: fixture.path }),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
			}),
		);

		expect(claude.runs[0]?.shellOutputs).toEqual([
			`${fixture.commits[1]}\n${fixture.commits[0]}\n`,
		]);
	});

	/**
	 * A recursive copy preserves symlinks, so a fixture holding one to an
	 * absolute path would hand the session a live path out of the attempt
	 * directory: the session would read the machine's real file through a tree
	 * the harness promised was its own.
	 */
	it("refuses a fixture tree holding a symlink, naming it, before any provider call", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "rehearse-fixture-"));
		resources.track(fixture);
		await mkdir(join(fixture, "docs"), { recursive: true });
		await symlink("/etc/hosts", join(fixture, "docs", "escape.md"));
		const projects = await projectsRoot();
		const entriesBefore = await readdir(tmpdir());
		const attemptDirectoriesBefore = new Set(
			entriesBefore.filter((entry) => /^rehearse-attempt-[^-]+$/u.test(entry)),
		);

		const failure = await failureOf(
			runSessionAttempt(
				request({
					sessionCase: sessionCase({ fixturePath: fixture }),
					projectsDirectory: projects,
					recordDirectory: await recordDirectory(),
					runClaude: () =>
						Promise.reject(new Error("a provider call must not happen")),
				}),
			),
		);

		expect(failure.message).toContain(join("docs", "escape.md"));
		const entriesAfter = await readdir(tmpdir());
		const newAttemptDirectories = entriesAfter
			.filter((entry) => /^rehearse-attempt-[^-]+$/u.test(entry))
			.filter((entry) => !attemptDirectoriesBefore.has(entry));
		expect(newAttemptDirectories).toEqual([]);
	});

	it("copies the transcript the provider wrote into the attempt record", async () => {
		const projects = await projectsRoot();
		const records = await recordDirectory();

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: records,
				runClaude: new FakeClaude(projects, "OK").run,
			}),
		);

		expect(attempt.reply).toBe("OK");
		expect(await Bun.file(attempt.transcriptFile).text()).toContain("OK");
		expect(attempt.transcriptDiagnostics).toEqual({
			state: "complete",
			prefixLinesExcluded: 0,
			sourceLineCount: 1,
			measuredLineCount: 1,
			toolUseOccurrences: { total: 0, byName: [] },
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [],
		});
	});

	it("leaves the projects slug directory holding no file the attempt created", async () => {
		const projects = await projectsRoot();

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: new FakeClaude(projects, "OK").run,
			}),
		);

		const slug = join(projects, projectSlug(attempt.attemptDirectory));
		expect(await readdir(slug).catch(() => [])).toEqual([]);
	});

	it("copies the forked transcript when the resumed session appends to it rather than writing a new file", async () => {
		const prefix = await writtenPrefix(
			`${transcriptLine(SOURCE_SESSION, "the codeword is PLUMBAGO")}\n`,
		);
		const projects = await projectsRoot();

		const attempt = await runSessionAttempt(
			request({
				sessionCase: resumingCase(prefix.path, prefix.sha256),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: appendingClaude(projects, "PLUMBAGO"),
			}),
		);

		expect(await Bun.file(attempt.transcriptFile).text()).toContain("PLUMBAGO");
		expect(attempt.transcriptDiagnostics).toMatchObject({
			state: "complete",
			prefixLinesExcluded: 1,
			sourceLineCount: 2,
			measuredLineCount: 1,
		});
	});

	it("keeps the first post-cut call when the captured prefix contains a blank physical line", async () => {
		const prefix = await writtenPrefix(
			`${transcriptLine(SOURCE_SESSION, "first")}\n\n${transcriptLine(SOURCE_SESSION, "second")}\n`,
		);
		const projects = await projectsRoot();
		const base = resumingCase(prefix.path, prefix.sha256);
		const resumed = {
			...base,
			declaration: {
				...base.declaration,
				transcript: {
					file: "prefix.jsonl",
					sha256: prefix.sha256,
					sourceSession: SOURCE_SESSION,
					cut: 2,
				},
			},
		};

		const attempt = await runSessionAttempt(
			request({
				sessionCase: resumed,
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: async (command, cwd) => {
					const sessionId = command[command.indexOf("--resume") + 1] ?? "";
					const slug = join(projects, projectSlug(await realpath(cwd)));
					const file = join(slug, `${sessionId}.jsonl`);
					await writeFile(
						file,
						`${await Bun.file(file).text()}${bashToolUseLine(sessionId, "bash-1", "pwd")}\n${toolResultLine("bash-1", true)}\n${transcriptLine(sessionId, "OK")}\n`,
					);

					return envelope("OK");
				},
			}),
		);

		expect(attempt.transcriptDiagnostics).toEqual({
			state: "complete",
			prefixLinesExcluded: 2,
			sourceLineCount: 6,
			measuredLineCount: 3,
			toolUseOccurrences: {
				total: 1,
				byName: [{ name: "Bash", count: 1 }],
			},
			toolErrors: [
				{
					toolUseId: "bash-1",
					toolName: "Bash",
					call: { line: 4, block: 1 },
					result: { line: 5, block: 1 },
				},
			],
			repeatedBashCommands: [],
			issues: [],
		});
	});

	it("scores a tool-calls check against the turn under test, not the seeded transcript prefix", async () => {
		const prefix = await writtenPrefix(`${toolUseLine(SOURCE_SESSION)}\n`);
		const projects = await projectsRoot();

		const attempt = await runSessionAttempt(
			request({
				sessionCase: resumingCase(prefix.path, prefix.sha256, {
					checks: [{ kind: "tool-calls", max: 0 }],
				}),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: appendingClaude(projects, "OK"),
			}),
		);

		expect(attempt.checks).toEqual([
			{ kind: "tool-calls", status: "PASS", detail: "0 tool calls" },
		]);
	});

	it("scores a files-read check against the turn under test, not a file the seeded prefix read", async () => {
		const prefix = await writtenPrefix(
			`${readFileLine(SOURCE_SESSION, "prefix-only.md")}\n`,
		);
		const projects = await projectsRoot();

		const attempt = await runSessionAttempt(
			request({
				sessionCase: resumingCase(prefix.path, prefix.sha256, {
					checks: [{ kind: "files-read", paths: ["prefix-only.md"] }],
				}),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: appendingClaude(projects, "OK"),
			}),
		);

		expect(attempt.checks).toEqual([
			{
				kind: "files-read",
				status: "FAIL",
				detail: "never read prefix-only.md",
			},
		]);
	});

	it("names an invoked skill's layout path in the recorded context manifest", async () => {
		const projects = await projectsRoot();

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claudeWriting(
					projects,
					(sessionId) => [skillUseLine(sessionId, "verify")],
					"OK",
				),
			}),
		);

		expect(attempt.contextManifest?.paths).toContainEqual({
			path: "skills/verify/SKILL.md",
			half: "corpus",
		});
	});

	it("names a declared project file's Read as a project-half entry in the recorded context manifest", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "rehearse-fixture-"));
		resources.track(fixture);
		await writeFile(join(fixture, "NOTES.md"), "planted\n");
		const projects = await projectsRoot();
		const runClaude: SessionAttemptRequest["runClaude"] = async (
			command,
			cwd,
		) => {
			const sessionId = namedSession(command);
			const slug = join(projects, projectSlug(await realpath(cwd)));
			await mkdir(slug, { recursive: true });
			await writeFile(
				join(slug, `${sessionId}.jsonl`),
				`${[
					readFileLine(sessionId, join(cwd, "NOTES.md")),
					transcriptLine(sessionId, "OK"),
				].join("\n")}\n`,
			);

			return envelope("OK");
		};

		const attempt = await runSessionAttempt(
			request({
				sessionCase: sessionCase({
					fixturePath: fixture,
					projectFiles: ["NOTES.md"],
				}),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude,
			}),
		);

		expect(attempt.contextManifest?.paths).toContainEqual({
			path: "NOTES.md",
			half: "project",
		});
	});

	it("names the last output_style attachment's layout path in the recorded context manifest", async () => {
		const projects = await projectsRoot();

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claudeWriting(
					projects,
					() => [outputStyleLine("brief")],
					"OK",
				),
			}),
		);

		expect(attempt.contextManifest?.paths).toContainEqual({
			path: "output-styles/brief.md",
			half: "corpus",
		});
	});

	it("excludes a skill invoked only in the seeded transcript prefix from the recorded context manifest", async () => {
		const prefix = await writtenPrefix(
			`${skillUseLine(SOURCE_SESSION, "verify")}\n`,
		);
		const projects = await projectsRoot();

		const attempt = await runSessionAttempt(
			request({
				sessionCase: resumingCase(prefix.path, prefix.sha256),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: appendingClaude(projects, "OK"),
			}),
		);

		expect(attempt.contextManifest?.paths).not.toContainEqual({
			path: "skills/verify/SKILL.md",
			half: "corpus",
		});
	});

	it("counts every tool use in the turn when the case declares no transcript prefix", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		const attempt = await runSessionAttempt(
			request({
				sessionCase: sessionCase({
					checks: [{ kind: "tool-calls", max: 0 }],
				}),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
			}),
		);

		expect(attempt.checks).toEqual([
			{ kind: "tool-calls", status: "PASS", detail: "0 tool calls" },
		]);
	});

	it("refuses a transcript prefix whose bytes do not match the declared digest, naming the case and both digests", async () => {
		const prefix = await writtenPrefix(
			`${transcriptLine(SOURCE_SESSION, "bytes the declaration never hashed")}\n`,
		);
		const declared = "a".repeat(64);

		const failure = await failureOf(
			runSessionAttempt(
				request({
					sessionCase: resumingCase(prefix.path, declared),
					projectsDirectory: await projectsRoot(),
					recordDirectory: await recordDirectory(),
					runClaude: () =>
						Promise.reject(new Error("a provider call must not happen")),
				}),
			),
		);

		expect(failure).toBeInstanceOf(SessionInputError);
		expect(failure.message).toBe(
			`Case probe declares transcript prefix.jsonl at ${declared}, but ${prefix.path} hashes ${prefix.sha256}`,
		);
	});

	it("refuses a declared transcript prefix that is not on disk, naming the case and the file, before any provider call", async () => {
		const prefix = await writtenPrefix(
			`${transcriptLine(SOURCE_SESSION, "bytes that will not be there")}\n`,
		);
		await rm(prefix.path);

		const failure = await failureOf(
			runSessionAttempt(
				request({
					sessionCase: resumingCase(prefix.path, prefix.sha256),
					projectsDirectory: await projectsRoot(),
					recordDirectory: await recordDirectory(),
					runClaude: () =>
						Promise.reject(new Error("a provider call must not happen")),
				}),
			),
		);

		expect(failure).toBeInstanceOf(SessionInputError);
		expect(failure.message).toBe(
			`Case probe declares transcript prefix.jsonl, but no file is at ${prefix.path}. Add the bytes to that case directory, or recapture them with \`rehearse case capture\`.`,
		);
	});

	it("refuses a prefix whose declared source session appears nowhere in its bytes, before any provider call", async () => {
		const prefix = await writtenPrefix(
			`${transcriptLine("22222222-2222-2222-2222-222222222222", "bytes another session wrote")}\n`,
		);

		const failure = await failureOf(
			runSessionAttempt(
				request({
					sessionCase: resumingCase(prefix.path, prefix.sha256),
					projectsDirectory: await projectsRoot(),
					recordDirectory: await recordDirectory(),
					runClaude: () =>
						Promise.reject(new Error("a provider call must not happen")),
				}),
			),
		);

		expect(failure).toBeInstanceOf(SessionInputError);
		expect(failure.message).toBe(
			`Case probe declares transcript prefix.jsonl from session ${SOURCE_SESSION}, which appears nowhere in ${prefix.path}; a fork rewrites that id where it occurs, so an absent one would leave the source session's id in the attempt`,
		);
	});

	it("refuses a declared transcript prefix that is a symlink, before any provider call", async () => {
		const prefix = await writtenPrefix(
			`${transcriptLine(SOURCE_SESSION, "bytes behind the link")}\n`,
		);
		const link = join(dirname(prefix.path), "linked.jsonl");
		await symlink(prefix.path, link);

		const failure = await failureOf(
			runSessionAttempt(
				request({
					sessionCase: resumingCase(link, prefix.sha256),
					projectsDirectory: await projectsRoot(),
					recordDirectory: await recordDirectory(),
					runClaude: () =>
						Promise.reject(new Error("a provider call must not happen")),
				}),
			),
		);

		expect(failure).toBeInstanceOf(SessionInputError);
		expect(failure.message).toBe(
			`Case probe declares transcript prefix.jsonl at ${link}, which is a symlink; a prefix is read as the bytes the case directory holds`,
		);
	});

	it("removes the transcript the provider wrote even when reading the envelope fails", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");
		let attemptCwd = "";

		const failure = await failureOf(
			runSessionAttempt(
				request({
					projectsDirectory: projects,
					recordDirectory: await recordDirectory(),
					runClaude: async (command, cwd) => {
						attemptCwd = await realpath(cwd);
						await claude.run(command, cwd);

						return "not a claude envelope";
					},
				}),
			),
		);

		expect(failure).toBeInstanceOf(Error);
		expect(failure).not.toBeInstanceOf(SessionInvocationError);
		expect(
			await readdir(join(projects, projectSlug(attemptCwd))).catch(() => []),
		).toEqual([]);
	});

	it("keeps a schema-invalid provider envelope outside typed invocation failures", async () => {
		const projects = await projectsRoot();
		const failure = await failureOf(
			runSessionAttempt(
				request({
					projectsDirectory: projects,
					recordDirectory: await recordDirectory(),
					runClaude: () =>
						Promise.resolve(
							JSON.stringify({
								session_id: "session-1",
								is_error: "yes",
								result: "not valid",
							}),
						),
				}),
			),
		);

		expect(failure).toBeInstanceOf(Error);
		expect(failure).not.toBeInstanceOf(SessionInvocationError);
	});

	/**
	 * A max-turns or budget-exhausted termination returns an envelope with no
	 * `result` and `is_error` unset, which is not a reply of zero words: the
	 * smoke case's own checks (word band at most 1, no tool calls) both pass
	 * over the empty string.
	 */
	function replylessClaude(
		run: SessionAttemptRequest["runClaude"],
	): SessionAttemptRequest["runClaude"] {
		return async (command, cwd) => {
			await run(command, cwd);

			return JSON.stringify({
				type: "result",
				subtype: "error_max_turns",
				session_id: namedSession(command),
				is_error: false,
				total_cost_usd: 0.0012,
				num_turns: 30,
			});
		};
	}

	it("records an envelope with no result as no reply rather than as a passing empty one", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		const attempt = await runSessionAttempt(
			request({
				sessionCase: sessionCase({
					checks: [
						{ kind: "word-band", max: 1 },
						{ kind: "tool-calls", max: 0 },
					],
				}),
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: replylessClaude(claude.run),
			}),
		);

		expect(attempt.outcome).toBe("NO_REPLY");
		expect(attempt.transcriptDiagnostics.state).toBe("complete");
	});

	it("preserves supplied context evidence when the provider returns no reply", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");
		const source = await contextEvidenceSource();

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				contextEvidenceSource: source,
				runClaude: replylessClaude(claude.run),
			}),
		);

		expect(attempt.outcome).toBe("NO_REPLY");
		expect(attempt.contextEvidence?.source).toEqual(source);
	});

	it("evaluates no check when the session produced no reply", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: replylessClaude(claude.run),
			}),
		);

		expect(attempt.checks).toEqual([]);
	});

	it("retains nonzero tool diagnostics when the session produced no reply", async () => {
		const projects = await projectsRoot();
		const run = claudeWriting(
			projects,
			(sessionId) => [
				bashToolUseLine(sessionId, "bash-1", "pwd"),
				toolResultLine("bash-1"),
			],
			"OK",
		);

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: replylessClaude(run),
			}),
		);

		expect(attempt).toMatchObject({
			outcome: "NO_REPLY",
			transcriptDiagnostics: {
				state: "complete",
				toolUseOccurrences: {
					total: 1,
					byName: [{ name: "Bash", count: 1 }],
				},
			},
		});
	});

	it("records no context manifest when the session produced no reply", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: replylessClaude(claude.run),
			}),
		);

		expect(attempt.contextManifest).toBeUndefined();
	});

	/**
	 * The planted names bracket the provider's own file in codepoint order, so a
	 * subject that picks the attempt's transcript by sorting the new entries
	 * takes a planted one whichever direction it sorts. A test that plants only
	 * one name passes or fails on where that name happens to sort.
	 */
	const PLANTED_BEFORE = "0000-unrelated-live.jsonl";
	const PLANTED_AFTER = "zzzz-unrelated-live.jsonl";

	function plantingClaude(
		projects: string,
		run: SessionAttemptRequest["runClaude"],
	): SessionAttemptRequest["runClaude"] {
		return async (command, cwd) => {
			const slug = join(projects, projectSlug(await realpath(cwd)));
			await mkdir(slug, { recursive: true });
			await writeFile(join(slug, PLANTED_BEFORE), "{}\n");
			await writeFile(join(slug, PLANTED_AFTER), "{}\n");

			return run(command, cwd);
		};
	}

	it("keeps every file another session planted in the slug directory mid-run", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: plantingClaude(projects, claude.run),
			}),
		);

		const slug = join(projects, projectSlug(attempt.attemptDirectory));
		const remaining = await readdir(slug);
		expect(remaining.toSorted()).toEqual([PLANTED_BEFORE, PLANTED_AFTER]);
	});

	it("records the transcript the provider's own session wrote, not a file planted beside it", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: plantingClaude(projects, claude.run),
			}),
		);

		const [only] = claude.runs;
		expect(await Bun.file(attempt.transcriptFile).text()).toBe(
			`${transcriptLine(namedSession(only?.command ?? []), "OK")}\n`,
		);
	});

	it("preserves a rejected provider command as a typed failed invocation", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");
		const records = await recordDirectory();

		const failure = await failureOf(
			runSessionAttempt(
				request({
					projectsDirectory: projects,
					recordDirectory: records,
					runClaude: async (command, cwd) => {
						await claude.run(command, cwd);

						throw new Error("claude exited 1");
					},
				}),
			),
		);

		expect(failure).toBeInstanceOf(SessionInvocationError);
		expect(failure).toMatchObject({
			message: "claude exited 1",
			attempt: {
				outcome: "EXECUTION_FAILED",
				reply: undefined,
				checks: [],
				transcriptDiagnostics: { state: "complete" },
			},
		});
		expect(await Bun.file(join(records, "transcript.jsonl")).text()).toContain(
			"OK",
		);
	});

	it("preserves supplied context evidence when the provider runner throws", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "OK");
		const source = await contextEvidenceSource();

		const failure = await failureOf(
			runSessionAttempt(
				request({
					projectsDirectory: projects,
					recordDirectory: await recordDirectory(),
					contextEvidenceSource: source,
					runClaude: async (command, cwd) => {
						await claude.run(command, cwd);
						throw new Error("provider unavailable");
					},
				}),
			),
		);

		expect(failure).toMatchObject({
			attempt: {
				outcome: "EXECUTION_FAILED",
				contextEvidence: { source },
			},
		});
	});

	it("retains metrics from a rejected command's valid provider envelope", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "partial reply");
		const records = await recordDirectory();

		const failure = await failureOf(
			runSessionAttempt(
				request({
					projectsDirectory: projects,
					recordDirectory: records,
					runClaude: async (command, cwd) => {
						await claude.run(command, cwd);
						throw new CommandError(
							command,
							1,
							JSON.stringify({
								session_id: namedSession(command),
								is_error: true,
								result: "session exhausted its budget",
								total_cost_usd: 0.0012,
								num_turns: 2,
								duration_ms: 900,
								duration_api_ms: 800,
								usage: {
									input_tokens: 12,
									output_tokens: 3,
									cache_read_input_tokens: 0,
									cache_creation_input_tokens: 0,
								},
							}),
							"",
						);
					},
				}),
			),
		);

		expect(failure).toBeInstanceOf(SessionInvocationError);
		expect(failure).toMatchObject({
			message: "session exhausted its budget",
			attempt: {
				outcome: "EXECUTION_FAILED",
				metrics: { costUsd: 0.0012, turns: 2 },
			},
		});
	});

	it("preserves a valid provider error envelope as a typed failed invocation", async () => {
		const projects = await projectsRoot();
		const claude = new FakeClaude(projects, "partial reply");
		const records = await recordDirectory();
		const source = await contextEvidenceSource();

		const failure = await failureOf(
			runSessionAttempt(
				request({
					projectsDirectory: projects,
					recordDirectory: records,
					contextEvidenceSource: source,
					runClaude: async (command, cwd) => {
						await claude.run(command, cwd);

						return JSON.stringify({
							session_id: namedSession(command),
							is_error: true,
							result: "session exhausted its budget",
							total_cost_usd: 0.0012,
							num_turns: 2,
							duration_ms: 900,
							duration_api_ms: 800,
							usage: {
								input_tokens: 12,
								output_tokens: 3,
								cache_read_input_tokens: 0,
								cache_creation_input_tokens: 0,
							},
						});
					},
				}),
			),
		);

		expect(failure).toBeInstanceOf(SessionInvocationError);
		expect(failure).toMatchObject({
			message: "session exhausted its budget",
			attempt: {
				outcome: "EXECUTION_FAILED",
				metrics: { costUsd: 0.0012, turns: 2 },
				contextEvidence: {
					schemaVersion: 1,
					source,
				},
			},
		});
		expect(await Bun.file(join(records, "transcript.jsonl")).text()).toContain(
			"partial reply",
		);
	});

	it("gives a blank provider error result a recordable diagnostic", async () => {
		const projects = await projectsRoot();
		const failure = await failureOf(
			runSessionAttempt(
				request({
					projectsDirectory: projects,
					recordDirectory: await recordDirectory(),
					runClaude: () =>
						Promise.resolve(
							JSON.stringify({
								session_id: "session-1",
								is_error: true,
								result: "",
							}),
						),
				}),
			),
		);

		expect(failure).toBeInstanceOf(SessionInvocationError);
		expect(failure.message).toBe("Claude session failed");
		expect(failure).toMatchObject({
			attempt: {
				transcriptDiagnostics: {
					state: "unavailable",
					prefixLinesExcluded: 0,
				},
			},
		});
	});

	it("removes the slug directory itself once the attempt's files are gone", async () => {
		const projects = await projectsRoot();

		const attempt = await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: new FakeClaude(projects, "OK").run,
			}),
		);

		expect(await readdir(projects)).not.toContain(
			projectSlug(attempt.attemptDirectory),
		);
	});
});
