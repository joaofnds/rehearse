import { describe, expect, it } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	realpath,
	symlink,
	writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { SessionCase } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import type { SessionRunConfig } from "#benchmark/config";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import { EXIT_CODES, exitCodeFor } from "#benchmark/exit-codes";
import { syntheticRateProvenance } from "#benchmark/rate-catalog-test-support";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { projectSlug } from "#benchmark/session-capture";
import { readShortIds } from "#benchmark/short-id";
import type { ClaudeRunner } from "#benchmark/session-attempt";
import { SessionInvocationError } from "#benchmark/session-invocation-error";
import { TestResources } from "#benchmark/test-support";
import { failureOf } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { runSessionDebugAttempt } from "#cli/session-run-command";
import {
	CorpusConfigurationError,
	liveCorpusSource,
} from "#benchmark/corpus-file";
import {
	contextEvidenceSourceSchema,
	contextRateCatalogSchema,
} from "#benchmark/context-evidence";

const testResources = TestResources.forEachTest();

const config: SessionRunConfig = {
	caseId: "smoke",
	model: "haiku",
	effort: "low",
	judgeModel: "opus",
	judgeEffort: "low",
	sessionBudgetUsd: 0.2,
};

function sessionCase(
	overrides: Immutable<Partial<SessionCase>> = {},
): SessionCase {
	return {
		kind: "session",
		declaration: {
			id: "smoke",
			kind: "session",
			title: "Smoke",
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

function resumingCase(transcriptPath: string): SessionCase {
	const base = sessionCase({ transcriptPath });

	return {
		...base,
		declaration: {
			...base.declaration,
			transcript: {
				file: "prefix.jsonl",
				sha256: "a".repeat(64),
				sourceSession: "11111111-1111-1111-1111-111111111111",
				cut: 1,
			},
		},
	};
}

/**
 * The provider writes its session file under the id the command line named,
 * which is what lets the harness account for the file it must remove.
 */
function fakeClaude(projects: string, reply: string): ClaudeRunner {
	return async (command, cwd) => {
		const sessionId = command[command.indexOf("--session-id") + 1] ?? "";
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${JSON.stringify({
				type: "assistant",
				message: { content: [{ type: "text", text: reply }] },
			})}\n`,
		);

		return fakeClaudeEnvelope(sessionId, reply);
	};
}

function diagnosticClaude(projects: string): ClaudeRunner {
	return async (command, cwd) => {
		const sessionId = command[command.indexOf("--session-id") + 1] ?? "";
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		const blocks = [
			{
				type: "assistant",
				message: {
					content: [
						{
							type: "tool_use",
							id: "bash-1",
							name: "Bash",
							input: { command: "ls" },
						},
					],
				},
			},
			{
				type: "user",
				message: {
					content: [{ type: "tool_result", tool_use_id: "bash-1" }],
				},
			},
			{
				type: "assistant",
				message: {
					content: [
						{
							type: "tool_use",
							id: "read-1",
							name: "Read",
							input: { file_path: "/tmp/x.md" },
						},
					],
				},
			},
			{
				type: "user",
				message: {
					content: [{ type: "tool_result", tool_use_id: "read-1" }],
				},
			},
			{
				type: "assistant",
				message: {
					content: [
						{
							type: "tool_use",
							id: "bash-2",
							name: "Bash",
							input: { command: "ls" },
						},
					],
				},
			},
			{
				type: "user",
				message: {
					content: [
						{ type: "tool_result", tool_use_id: "bash-2", is_error: true },
					],
				},
			},
			{
				type: "assistant",
				message: {
					content: [
						{
							type: "tool_use",
							id: "bash-3",
							name: "Bash",
							input: { command: "ls " },
						},
					],
				},
			},
			{
				type: "user",
				message: {
					content: [{ type: "tool_result", tool_use_id: "bash-3" }],
				},
			},
			{
				type: "assistant",
				message: { content: [{ type: "text", text: "OK" }] },
			},
		];
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${blocks.map((block) => JSON.stringify(block)).join("\n")}\n`,
		);

		return fakeClaudeEnvelope(sessionId, "OK");
	};
}

function fakeClaudeEnvelope(sessionId: string, reply: string): string {
	return JSON.stringify({
		session_id: sessionId,
		is_error: false,
		result: reply,
		total_cost_usd: 0.0011,
		num_turns: 1,
		duration_ms: 800,
		duration_api_ms: 700,
		usage: {
			input_tokens: 10,
			output_tokens: 2,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 0,
		},
	});
}

async function temporary(prefix: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	testResources.track(directory);

	return directory;
}

describe(runSessionDebugAttempt.name, () => {
	it("writes one record carrying the reply, the transcript path, the metrics, and a result per check", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase(),
			config,
			runsDirectory: runs,
			runClaude: fakeClaude(projects, "OK"),
			projectsDirectory: projects,
		});

		expect(outcome.record).toMatchObject({
			schemaVersion: 3,
			caseId: "smoke",
			model: "haiku",
			effort: "low",
			reply: "OK",
			outcome: "SUCCESSFUL",
			checks: [{ kind: "word-band", status: "PASS" }],
		});
		expect(outcome.record.metrics?.costUsd).toBe(0.0011);
		expect(outcome.record.transcriptDiagnostics).toEqual({
			state: "complete",
			prefixLinesExcluded: 0,
			sourceLineCount: 1,
			measuredLineCount: 1,
			toolUseOccurrences: { total: 0, byName: [] },
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [],
		});
		expect(await Bun.file(outcome.record.transcriptFile).text()).toContain(
			"OK",
		);
	});

	it("claims the attempt a short id in its case", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase(),
			config,
			runsDirectory: runs,
			runClaude: fakeClaude(projects, "OK"),
			projectsDirectory: projects,
		});

		expect(await readShortIds(runs, "smoke")).toEqual([
			{
				shortId: "smoke/r1",
				record: {
					kind: "attempt:session",
					caseId: "smoke",
					uuid: basename(dirname(outcome.recordFile)),
				},
			},
		]);
	});

	it("prints a record that parses with the schema that wrote it", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase(),
			config,
			runsDirectory: runs,
			runClaude: fakeClaude(projects, "OK"),
			projectsDirectory: projects,
		});

		const written = parseSessionAttemptRecord(
			await Bun.file(outcome.recordFile).text(),
		);
		expect(written).toEqual(outcome.record);
	});

	it("persists provider context evidence through the saved attempt boundary", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");
		const contextEvidenceSource = contextEvidenceSourceSchema.parse(
			await Bun.file(
				new URL(
					"../benchmark/__fixtures__/context-evidence-source.json",
					import.meta.url,
				),
			).json(),
		);
		const contextRateCatalog = contextRateCatalogSchema.parse({
			schemaVersion: 1,
			source: "synthetic-rate-card",
			version: "2026-09-13",
			currency: "USD",
			provenance: syntheticRateProvenance,
			models: [
				{
					model: "claude-sonnet-5",
					inputUsdPerMillion: 3,
					outputUsdPerMillion: 15,
					cacheReadUsdPerMillion: 0.3,
					cacheWrite5mUsdPerMillion: 3.75,
					cacheWrite1hUsdPerMillion: 6,
				},
			],
		});

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase(),
			config,
			runsDirectory: runs,
			runClaude: fakeClaude(projects, "OK"),
			projectsDirectory: projects,
			contextEvidenceSource,
			contextRateCatalog,
		});
		const written = parseSessionAttemptRecord(
			await Bun.file(outcome.recordFile).text(),
		);

		expect(written.contextEvidence?.source).toEqual(contextEvidenceSource);
		expect(
			written.contextEvidence?.projection.requests.find(
				(request) => request.requestId === "req-child-1",
			)?.pricing,
		).toEqual({
			state: "complete",
			calculatedCostUsd: 0.005712,
			rateSource: "synthetic-rate-card",
			rateVersion: "2026-09-13",
			currency: "USD",
			selectedRate: {
				model: "claude-sonnet-5",
				inputUsdPerMillion: 3,
				outputUsdPerMillion: 15,
				cacheReadUsdPerMillion: 0.3,
				cacheWrite5mUsdPerMillion: 3.75,
				cacheWrite1hUsdPerMillion: 6,
			},
		});
		expect(written.contextEvidence?.rateCatalog).toEqual(contextRateCatalog);
	});

	it("persists exact tool diagnostics in the parsed attempt record", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase(),
			config,
			runsDirectory: runs,
			runClaude: diagnosticClaude(projects),
			projectsDirectory: projects,
		});
		const written = parseSessionAttemptRecord(
			await Bun.file(outcome.recordFile).text(),
		);

		expect(written.transcriptDiagnostics).toEqual({
			state: "complete",
			prefixLinesExcluded: 0,
			sourceLineCount: 9,
			measuredLineCount: 9,
			toolUseOccurrences: {
				total: 4,
				byName: [
					{ name: "Bash", count: 3 },
					{ name: "Read", count: 1 },
				],
			},
			toolErrors: [
				{
					toolUseId: "bash-2",
					toolName: "Bash",
					call: { line: 5, block: 1 },
					result: { line: 6, block: 1 },
				},
			],
			repeatedBashCommands: [
				{
					commandSha256:
						"c7b68ac37f364473e922936708e7f43c293dd07b295171566c07ff5fe024fab9",
					commandCharacters: 2,
					preview: "ls",
					previewTruncated: false,
					occurrences: [
						{ toolUseId: "bash-1", location: { line: 1, block: 1 } },
						{ toolUseId: "bash-2", location: { line: 5, block: 1 } },
					],
				},
			],
			issues: [],
		});
	});

	it("persists retained diagnostics when a direct provider attempt fails", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");
		const writesTranscript = diagnosticClaude(projects);

		const failure = await failureOf(
			runSessionDebugAttempt({
				sessionCase: sessionCase(),
				config,
				runsDirectory: runs,
				projectsDirectory: projects,
				runClaude: async (command, cwd) => {
					await writesTranscript(command, cwd);
					throw new Error("provider rejected the session");
				},
			}),
		);
		const [attemptId] = await readdir(join(runs, "sessions", "smoke"));
		const record = parseSessionAttemptRecord(
			await Bun.file(
				join(runs, "sessions", "smoke", attemptId ?? "", "attempt.json"),
			).text(),
		);

		expect(failure).toBeInstanceOf(SessionInvocationError);
		expect(record).toMatchObject({
			schemaVersion: 2,
			outcome: "EXECUTION_FAILED",
			error: "provider rejected the session",
			transcriptDiagnostics: {
				state: "complete",
				prefixLinesExcluded: 0,
				sourceLineCount: 9,
				measuredLineCount: 9,
				toolUseOccurrences: { total: 4 },
				toolErrors: [{ toolUseId: "bash-2" }],
				repeatedBashCommands: [{ preview: "ls" }],
			},
		});
	});

	it("reports the attempt unsuccessful when a check fails", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase(),
			config,
			runsDirectory: runs,
			runClaude: fakeClaude(projects, "OK sure thing"),
			projectsDirectory: projects,
		});

		expect(outcome.record.outcome).toBe("UNSUCCESSFUL");
		expect(outcome.record.checks[0]?.status).toBe("FAIL");
	});

	it("refuses a fixture tree holding a symlink, before any provider call", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");
		const fixture = await temporary("rehearse-fixture-");
		await symlink("/etc/hosts", join(fixture, "escape.md"));

		const failure = await failureOf(
			runSessionDebugAttempt({
				sessionCase: sessionCase({ fixturePath: fixture }),
				config,
				runsDirectory: runs,
				runClaude: () =>
					Promise.reject(new Error("a provider call must not happen")),
				projectsDirectory: projects,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("escape.md");
	});

	it("refuses a fixture whose seeded history git cannot read, exiting 3 before any provider call", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");
		const fixture = await temporary("rehearse-fixture-");
		await mkdir(join(fixture, "dot-git"), { recursive: true });
		await writeFile(join(fixture, "dot-git", "HEAD"), "ref: refs/heads/main\n");

		const calls: string[] = [];

		const failure = await failureOf(
			runSessionDebugAttempt({
				sessionCase: sessionCase({ fixturePath: fixture }),
				config,
				runsDirectory: runs,
				runClaude: (_command, cwd) => {
					calls.push(cwd);

					return Promise.resolve("");
				},
				projectsDirectory: projects,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(exitCodeFor(failure)).toBe(EXIT_CODES.refusedPrecondition);
		expect(failure.message).toContain(fixture);
		expect(calls).toEqual([]);
	});

	it("refuses a transcript prefix whose bytes do not match the declared digest, before any provider call", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");
		const prefix = join(await temporary("rehearse-prefix-"), "prefix.jsonl");
		await writeFile(prefix, "bytes the declaration never hashed\n");

		const failure = await failureOf(
			runSessionDebugAttempt({
				sessionCase: resumingCase(prefix),
				config,
				runsDirectory: runs,
				runClaude: () =>
					Promise.reject(new Error("a provider call must not happen")),
				projectsDirectory: projects,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("prefix.jsonl");
	});

	it("refuses a declared corpus file that does not resolve, before any provider call", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");

		const failure = await failureOf(
			runSessionDebugAttempt({
				sessionCase: sessionCase({
					corpusFiles: ["output-styles/no-such-style.md"],
				}),
				config,
				runsDirectory: runs,
				runClaude: () =>
					Promise.reject(new Error("a provider call must not happen")),
				projectsDirectory: projects,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("no-such-style.md");
		expect(await readShortIds(runs, "smoke")).toEqual([]);
	});

	it("refuses an out-of-extent live corpus file before any provider call", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");
		const root = await temporary("rehearse-live-install-");
		const backingRoot = await temporary("rehearse-live-backing-");
		const outside = await temporary("rehearse-live-outside-");
		await Bun.write(join(outside, "foreign.md"), "FOREIGN STYLE\n");
		await mkdir(join(root, "output-styles"), { recursive: true });
		await symlink(
			join(outside, "foreign.md"),
			join(root, "output-styles", "foreign.md"),
		);
		let providerCalls = 0;

		const failure = await failureOf(
			runSessionDebugAttempt({
				sessionCase: sessionCase({
					corpusFiles: ["output-styles/foreign.md"],
				}),
				config,
				runsDirectory: runs,
				resolveCorpus: () =>
					Promise.resolve({ kind: "live", root, backingRoot }),
				runClaude: () => {
					providerCalls += 1;
					return Promise.reject(new Error("a provider call must not happen"));
				},
				projectsDirectory: projects,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("live corpus extent");
		expect(providerCalls).toBe(0);
	});

	it("reports an invalid needed live backing tree as a refused precondition", async () => {
		const runs = await temporary("rehearse-runs-");
		const projects = await temporary("rehearse-projects-");
		const root = await temporary("rehearse-live-install-");
		const outside = await temporary("rehearse-live-outside-");
		const backingRoot = join(await temporary("rehearse-live-backing-"), "file");
		await Bun.write(backingRoot, "not a directory\n");
		await Bun.write(join(outside, "foreign.md"), "FOREIGN STYLE\n");
		await mkdir(join(root, "output-styles"), { recursive: true });
		await symlink(
			join(outside, "foreign.md"),
			join(root, "output-styles", "foreign.md"),
		);
		let providerCalls = 0;

		const failure = await failureOf(
			runSessionDebugAttempt({
				sessionCase: sessionCase({
					corpusFiles: ["output-styles/foreign.md"],
				}),
				config,
				runsDirectory: runs,
				resolveCorpus: () =>
					Promise.resolve({ kind: "live", root, backingRoot }),
				runClaude: () => {
					providerCalls += 1;
					return Promise.reject(new Error("a provider call must not happen"));
				},
				projectsDirectory: projects,
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("not a directory");
		expect(providerCalls).toBe(0);
	});

	it("reports invalid live corpus configuration as a refused precondition", async () => {
		const failure = await failureOf(
			runSessionDebugAttempt({
				sessionCase: sessionCase(),
				config,
				runsDirectory: await temporary("rehearse-runs-"),
				resolveCorpus: () =>
					Promise.reject(new CorpusConfigurationError("invalid backing root")),
				runClaude: () =>
					Promise.reject(new Error("a provider call must not happen")),
				projectsDirectory: await temporary("rehearse-projects-"),
			}),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("invalid backing root");
	});
});

describe("running a session case against a corpus source", () => {
	async function corpusDirectory(brief: string): Promise<string> {
		const root = await temporary("rehearse-corpus-");
		await Bun.write(join(root, "output-styles/brief.md"), brief);

		return root;
	}

	function styledCase(): SessionCase {
		return sessionCase({
			corpusFiles: ["output-styles/brief.md"],
			declaration: {
				id: "smoke",
				kind: "session",
				title: "Smoke",
				prompt: "Reply with the single word OK.",
				tools: [],
				corpusFiles: ["output-styles/brief.md"],
				projectFiles: [],
				checks: [{ kind: "word-band", max: 1 }],
			},
		});
	}

	async function attemptWith(
		corpus: string | undefined,
	): Promise<Awaited<ReturnType<typeof runSessionDebugAttempt>>> {
		const projects = await temporary("rehearse-projects-");
		const runsDirectory = await temporary("rehearse-runs-");

		return runSessionDebugAttempt({
			sessionCase: styledCase(),
			config: corpus === undefined ? config : { ...config, corpus },
			runsDirectory,
			runClaude: fakeClaude(projects, "OK"),
			projectsDirectory: projects,
		});
	}

	it("records the corpus source's bytes rather than the live install's", async () => {
		const outcome = await attemptWith(await corpusDirectory("marker brief\n"));

		expect(outcome.record.corpusFiles[0]?.sha256).toBe(
			new Bun.CryptoHasher("sha256").update("marker brief\n").digest("hex"),
		);
	});

	/**
	 * Criterion 8's purpose is that two runs at one ref are comparable and a
	 * moved ref is visible, which only holds if the record on disk says where
	 * the bytes came from.
	 */
	it("records the directory source the corpus came from", async () => {
		const root = await corpusDirectory("marker brief\n");

		const outcome = await attemptWith(root);

		expect(outcome.record.corpusOrigin).toEqual({
			kind: "directory",
			source: root,
		});
	});

	it("records the corpus version of the source it ran against", async () => {
		const root = await corpusDirectory("marker brief\n");
		const expected = await measureCorpusVersion(
			await temporary("rehearse-records-"),
			{ kind: "directory", root },
		);

		const outcome = await attemptWith(root);

		expect(outcome.record.corpusVersion).toEqual(expected);
	});

	it("records the live install as the origin when no source is named", async () => {
		const outcome = await attemptWith(undefined);

		expect(outcome.record.corpusOrigin).toEqual({ kind: "live" });
	});

	it("writes the origin to the record file, not only to the value it returns", async () => {
		const root = await corpusDirectory("marker brief\n");

		const outcome = await attemptWith(root);

		expect(
			parseSessionAttemptRecord(await Bun.file(outcome.recordFile).text())
				.corpusOrigin,
		).toEqual({ kind: "directory", source: root });
	});

	it("changes the lineage when the source's declared bytes differ", async () => {
		const first = await attemptWith(await corpusDirectory("one brief\n"));
		const second = await attemptWith(await corpusDirectory("another brief\n"));

		expect(second.record.lineage).not.toBe(first.record.lineage);
	});

	it("leaves the lineage unchanged when two sources resolve to identical bytes", async () => {
		const first = await attemptWith(await corpusDirectory("same brief\n"));
		const second = await attemptWith(await corpusDirectory("same brief\n"));

		expect(second.record.lineage).toBe(first.record.lineage);
	});

	/**
	 * The declared file resolves and hashes successfully in hashCorpusFiles, so
	 * the attempt still runs; the fake session's transcript carries no tool_use
	 * that would name it, which is what reaches the divergence path rather than
	 * short-circuiting on the pre-flight missing-file refusal (ACT-59 AC#6).
	 */
	it("reports an unloaded-file divergence for a declared corpus file the session never read", async () => {
		const outcome = await attemptWith(await corpusDirectory("marker brief\n"));

		expect(outcome.record.divergences).toEqual([
			{
				kind: "unloaded-file",
				path: "output-styles/brief.md",
				half: "corpus",
			},
		]);
	});

	it("reports an undeclared-file divergence for a skill the session loaded but the case never declared", async () => {
		const projects = await temporary("rehearse-projects-");
		const runsDirectory = await temporary("rehearse-runs-");
		const runClaude: ClaudeRunner = async (command, cwd) => {
			const sessionId = command[command.indexOf("--session-id") + 1] ?? "";
			const slug = join(projects, projectSlug(await realpath(cwd)));
			await mkdir(slug, { recursive: true });
			await writeFile(
				join(slug, `${sessionId}.jsonl`),
				`${[
					{
						type: "assistant",
						message: {
							content: [
								{
									type: "tool_use",
									id: "toolu_skill",
									name: "Skill",
									input: { skill: "verify" },
								},
							],
						},
					},
					{
						type: "user",
						isMeta: true,
						message: {
							content: [
								{
									type: "text",
									text: `Base directory for this skill: ${liveCorpusSource().root}/skills/verify`,
								},
							],
						},
					},
					{
						type: "assistant",
						message: { content: [{ type: "text", text: "OK" }] },
					},
				]
					.map((record) => JSON.stringify(record))
					.join("\n")}\n`,
			);

			return JSON.stringify({
				session_id: sessionId,
				is_error: false,
				result: "OK",
				total_cost_usd: 0.0011,
				num_turns: 1,
				duration_ms: 800,
				duration_api_ms: 700,
				usage: {
					input_tokens: 10,
					output_tokens: 2,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 0,
				},
			});
		};

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase(),
			config,
			runsDirectory,
			runClaude,
			projectsDirectory: projects,
		});

		expect(outcome.record.divergences).toEqual([
			{
				kind: "undeclared-file",
				path: "skills/verify/SKILL.md",
				half: "corpus",
			},
		]);
	});

	it("reports an unloaded-file divergence for a declared project file the session never read, tagged project-half", async () => {
		const projects = await temporary("rehearse-projects-");
		const runsDirectory = await temporary("rehearse-runs-");

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase({ projectFiles: ["NOTES.md"] }),
			config,
			runsDirectory,
			runClaude: fakeClaude(projects, "OK"),
			projectsDirectory: projects,
		});

		expect(outcome.record.divergences).toEqual([
			{ kind: "unloaded-file", path: "NOTES.md", half: "project" },
		]);
	});

	/**
	 * The attempt runs with `--setting-sources project`, so the session reads the
	 * overlay the harness installs rather than the operator's install. The bytes
	 * are still the live install's, captured once; the resolved path is the frozen
	 * copy, because recording the live path would claim the session read a file it
	 * did not. The origin keeps the provenance, asserted by the test above.
	 */
	it("records the live install's bytes, resolved to the frozen copy, when no source is named", async () => {
		const outcome = await attemptWith(undefined);

		expect(outcome.record.corpusFiles[0]?.resolvedPath).toBe(
			join(dirname(outcome.recordFile), "corpus/output-styles/brief.md"),
		);
		expect(outcome.record.corpusFiles[0]?.sha256).toBe(
			new Bun.CryptoHasher("sha256")
				.update(
					await Bun.file(
						join(homedir(), ".claude/output-styles/brief.md"),
					).bytes(),
				)
				.digest("hex"),
		);
	});

	/**
	 * Every smoke attempt recorded before --corpus existed carries this lineage.
	 * A change to it would mean the flag silently rewrote what a run absent the
	 * flag measures, which is the one thing this card promised it would not do.
	 * ACT-37 added a fifth, settings-file field to lineageKey's hashed shape; a
	 * session case never sets it, so the pin moved once, deliberately, to the
	 * hash of the same four fields plus an always-absent fifth.
	 */
	it("records the lineage the smoke case carried before --corpus existed", async () => {
		const projects = await temporary("rehearse-projects-");

		const outcome = await runSessionDebugAttempt({
			sessionCase: sessionCase(),
			config,
			runsDirectory: await temporary("rehearse-runs-"),
			runClaude: fakeClaude(projects, "OK"),
			projectsDirectory: projects,
		});

		expect(outcome.record.lineage).toBe(
			"f5c101c10b2941f88f89b2ba059a7f2ca6782162ef7ddccded391fd2c4d5b71b",
		);
	});

	/**
	 * A source string the parser cannot turn into a corpus is an unparseable
	 * value, which the exit codes call a usage error; a corpus that resolves but
	 * cannot be delivered is the refused precondition.
	 */
	it.each(["/no/such/corpus", "dotfiles:HEAD"])(
		"reports %s as a usage error, before any provider call",
		async (corpus) => {
			const failure = await failureOf(attemptWith(corpus));

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toContain(corpus);
		},
	);
});
