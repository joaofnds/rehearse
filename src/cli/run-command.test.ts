import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BenchmarkCase, SessionCase } from "#benchmark/case";
import { corpusLayoutRoots } from "#benchmark/checkpoint";
import type { BenchmarkConfig } from "#benchmark/config";
import { parseArgs } from "#benchmark/config";
import type { PipelineDefinition } from "#benchmark/pipeline";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { TestResources } from "#benchmark/test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import type { RunCommandDependencies } from "#cli/run-command";
import {
	buildConfirmationRequest,
	executeSessionRun,
	runRunCommand,
} from "#cli/run-command";
import { UsageError } from "#cli/commands";
import { CorpusConfigurationError } from "#benchmark/corpus-file";

const args = [
	"--target",
	"/nonexistent-target",
	"--model",
	"sonnet",
	"--judge-model",
	"opus",
	"--session-budget-usd",
	"1",
];

const neverASession: RunCommandDependencies["executeSession"] = () =>
	Promise.reject(new Error("a session attempt must not start"));

const loadedStageSettings = {
	json: '{"disableAllHooks":true}',
	hashed: { path: "stage-settings.json", sha256: "b".repeat(64) },
};

const passingPreflight: RunCommandDependencies["assertPreflight"] = () =>
	Promise.resolve(loadedStageSettings);

const missingPreflight = {
	status: "MISSING",
	missing: "preflight call metrics",
} as const;

const passingProbe: RunCommandDependencies["probeModel"] = () =>
	Promise.resolve(missingPreflight);

const smokeCase: SessionCase = {
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
};

const resumedSmokeCase: SessionCase = {
	...smokeCase,
	declaration: {
		...smokeCase.declaration,
		transcript: {
			file: "prefix.jsonl",
			sha256: "a".repeat(64),
			sourceSession: "source-session",
			cut: 1,
		},
	},
	transcriptPath: "/cases/smoke/prefix.jsonl",
};

const sessionMetrics = {
	costUsd: 0.02,
	inputTokens: 10,
	outputTokens: 2,
	cacheReadTokens: 3,
	cacheWriteTokens: 4,
	turns: 1,
};

const unavailableTranscriptDiagnostics = {
	state: "unavailable",
	prefixLinesExcluded: 0,
} as const;

const testResources = TestResources.forEachTest();

const pipeline: PipelineDefinition = {
	statuses: ["To Do", "Build", "Done"],
	target: { checks: [], integrityFiles: [] },
	stages: [{ name: "build", kind: "delivery", skill: "build", rubric: "b" }],
};

const auditLogCase: BenchmarkCase = {
	kind: "pipeline",
	declaration: {
		id: "audit-log",
		kind: "pipeline",
		title: "Audit log",
		task: "backlog-seed.md",
		productBrief: "product-brief.md",
		finalRubric: "rubric.md",
		pipeline: "pipelines/default.json",
		rubrics: "rubrics",
		target: { path: "/declared/target" },
	},
	task: "Task",
	productBrief: "Brief",
	finalRubric: "Rubric",
	finalRubricPath: "/control/cases/audit-log/rubric.md",
	rubricsDirectory: "/control/cases/audit-log/rubrics",
	pipelinePath: "cases/audit-log/pipelines/default.json",
	pipeline,
	stageRubrics: {},
	targetPath: "/declared/target",
	settingsFilePath: "/control/stage-settings.json",
};

interface CaseLoader {
	readonly loaded: readonly string[];
	readonly requireCase: (id: string) => Promise<BenchmarkCase>;
}

function loadsAuditLog(): CaseLoader {
	const loaded: string[] = [];

	return {
		loaded,
		requireCase: (id) => {
			loaded.push(id);

			return Promise.resolve(auditLogCase);
		},
	};
}

describe(runRunCommand.name, () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { force: true, recursive: true })),
		);
	});

	it("refuses --pause before the run starts when stdin is not a terminal", async () => {
		const { output, stdout, stderr } = recordOutput();

		const failure = await failureOf(
			runRunCommand(
				{ args: [...args, "--pause"], json: false, stdinIsTerminal: false },
				{
					output,
					requireCase: loadsAuditLog().requireCase,
					assertPreflight: passingPreflight,
					probeModel: passingProbe,
					executeSession: neverASession,
					execute: () => Promise.reject(new Error("run must not start")),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("terminal");
		expect(stdout).toEqual([]);
		expect(stderr).toEqual([]);
	});

	it("starts without --pause when stdin is not a terminal", async () => {
		const { output } = recordOutput();
		const executed: BenchmarkConfig[] = [];

		await runRunCommand(
			{ args, json: false, stdinIsTerminal: false },
			{
				output,
				requireCase: loadsAuditLog().requireCase,
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: (config) => {
					executed.push(config);

					return Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/2026.json",
					});
				},
			},
		);

		expect(executed).toHaveLength(1);
		expect(executed[0]?.pause).toBe(false);
	});

	it("loads the case --case names, and audit-log when the flag is absent", async () => {
		const loader = loadsAuditLog();
		const { output } = recordOutput();
		const dependencies = {
			output,
			requireCase: loader.requireCase,
			assertPreflight: passingPreflight,
			probeModel: passingProbe,
			executeSession: neverASession,
			execute: () =>
				Promise.resolve({
					kind: "debug" as const,
					recordFile: "/runs/2026.json",
				}),
		};

		await runRunCommand(
			{ args, json: false, stdinIsTerminal: true },
			dependencies,
		);
		await runRunCommand(
			{
				args: [...args, "--case", "other"],
				json: false,
				stdinIsTerminal: true,
			},
			dependencies,
		);

		expect(loader.loaded).toEqual(["audit-log", "other"]);
	});

	it("refuses an unknown case before the run starts", async () => {
		const { output, stdout } = recordOutput();

		const failure = await failureOf(
			runRunCommand(
				{
					args: [...args, "--case", "missing"],
					json: false,
					stdinIsTerminal: true,
				},
				{
					output,
					requireCase: (id) =>
						Promise.reject(new RefusedPreconditionError(`Unknown case ${id}`)),
					assertPreflight: passingPreflight,
					probeModel: passingProbe,
					executeSession: neverASession,
					execute: () => Promise.reject(new Error("run must not start")),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("missing");
		expect(stdout).toEqual([]);
	});

	it("runs the target the case declares when no flag or environment names one", async () => {
		const targets: string[] = [];
		const { output } = recordOutput();

		await runRunCommand(
			{
				args: ["--model", "sonnet", "--session-budget-usd", "1"],
				json: false,
				stdinIsTerminal: true,
			},
			{
				output,
				requireCase: loadsAuditLog().requireCase,
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: (config) => {
					targets.push(config.sourceDir);

					return Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/2026.json",
					});
				},
			},
		);

		expect(targets).toEqual(["/declared/target"]);
	});

	it("passes the settings loaded by preflight into the run", async () => {
		const preflighted: Parameters<
			RunCommandDependencies["assertPreflight"]
		>[0][] = [];
		const executedWith: unknown[] = [];
		const { output } = recordOutput();

		await runRunCommand(
			{ args, json: false, stdinIsTerminal: true },
			{
				output,
				requireCase: loadsAuditLog().requireCase,
				assertPreflight: (inputs) => {
					preflighted.push(inputs);

					return Promise.resolve(loadedStageSettings);
				},
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: (_config, _output, _case, settings) => {
					executedWith.push(settings);

					return Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/2026.json",
					});
				},
			},
		);

		expect(preflighted).toEqual([
			{
				sourceDir: "/nonexistent-target",
				settingsFilePath: "/control/stage-settings.json",
				model: "sonnet",
			},
		]);
		expect(executedWith).toEqual([loadedStageSettings]);
	});

	it("hands the run the case it loaded, with the case's own pipeline", async () => {
		const executed: BenchmarkCase[] = [];
		const { output } = recordOutput();

		await runRunCommand(
			{ args, json: false, stdinIsTerminal: true },
			{
				output,
				requireCase: loadsAuditLog().requireCase,
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: (_config, _commandOutput, benchmarkCase) => {
					executed.push(benchmarkCase);

					return Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/2026.json",
					});
				},
			},
		);

		expect(executed).toEqual([auditLogCase]);
	});

	it("records the overriding pipeline path when --pipeline names another file", async () => {
		const recorded: string[] = [];
		const { output } = recordOutput();

		await runRunCommand(
			{
				args: [...args, "--pipeline", "cases/audit-log/pipelines/other.json"],
				json: false,
				stdinIsTerminal: true,
			},
			{
				output,
				requireCase: () =>
					Promise.resolve({
						...auditLogCase,
						pipelinePath: "cases/audit-log/pipelines/other.json",
					}),
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: (config) => {
					recorded.push(config.pipelinePath);

					return Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/2026.json",
					});
				},
			},
		);

		expect(recorded).toEqual(["cases/audit-log/pipelines/other.json"]);
	});

	it("refuses a --pipeline naming a file that is not there, before the run starts", async () => {
		const { output, stdout, stderr } = recordOutput();

		const failure = await failureOf(
			runRunCommand(
				{
					args: [
						...args,
						"--pipeline",
						"cases/audit-log/pipelines/missing.json",
					],
					json: false,
					stdinIsTerminal: true,
				},
				{
					output,
					requireCase: loadsAuditLog().requireCase,
					assertPreflight: passingPreflight,
					probeModel: passingProbe,
					executeSession: neverASession,
					execute: () => Promise.reject(new Error("run must not start")),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("missing.json");
		expect(stdout).toEqual([]);
		expect(stderr).toEqual([]);
	});

	it("runs the confirmation group without a terminal when --yes answers the approval", async () => {
		const { output, stdout } = recordOutput();

		await runRunCommand(
			{
				args: [...args, "--confirm", "--yes"],
				json: false,
				stdinIsTerminal: false,
			},
			{
				output,
				requireCase: loadsAuditLog().requireCase,
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: () =>
					Promise.resolve({
						kind: "confirmation" as const,
						recordFile: "/runs/report.json",
					}),
			},
		);

		expect(stdout.join("")).toBe("/runs/report.json\n");
	});

	it("refuses a confirmation group without a terminal when --yes is absent", async () => {
		const { output } = recordOutput();

		const failure = await failureOf(
			runRunCommand(
				{
					args: [...args, "--confirm"],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					requireCase: loadsAuditLog().requireCase,
					assertPreflight: passingPreflight,
					probeModel: passingProbe,
					executeSession: neverASession,
					execute: () => Promise.reject(new Error("run must not start")),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
	});

	it("prints the run artifact path on stdout and diagnostics on stderr", async () => {
		const { output, stdout, stderr } = recordOutput();

		await runRunCommand(
			{ args, json: false, stdinIsTerminal: true },
			{
				output,
				requireCase: loadsAuditLog().requireCase,
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: (_config, commandOutput) => {
					commandOutput.stderr("Target: /nonexistent-target\n");

					return Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/2026.json",
					});
				},
			},
		);

		expect(stdout.join("")).toBe("/runs/2026.json\n");
		expect(stderr.join("")).toBe("Target: /nonexistent-target\n");
	});

	it("warns once on stderr about a same-family Judge before the run starts", async () => {
		const events: string[] = [];
		const { output, stdout } = recordOutput();

		await runRunCommand(
			{
				args: [
					"--target",
					"/nonexistent-target",
					"--model",
					"sonnet",
					"--judge-model",
					"claude-sonnet-4-6",
					"--session-budget-usd",
					"1",
				],
				json: false,
				stdinIsTerminal: true,
			},
			{
				output: {
					stdout: output.stdout,
					stderr: (text) => {
						events.push(text);
						output.stderr(text);
					},
				},
				requireCase: (id) => {
					events.push("load-case");

					return Promise.resolve({
						...auditLogCase,
						declaration: { ...auditLogCase.declaration, id },
					});
				},
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: () =>
					Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/2026.json",
					}),
			},
		);

		expect(
			events.filter((event) => event.includes("Self-preference warning")),
		).toHaveLength(1);
		expect(events[0]).toBe("load-case");
		expect(stdout.join("")).toBe("/runs/2026.json\n");
	});

	it("prints the run artifact's exact bytes on stdout with --json", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-json-"));
		temporaryDirectories.push(directory);
		const recordFile = join(directory, "artifact.json");
		const recordText = `${JSON.stringify({ schemaVersion: 1, status: "COMPLETE" }, null, 2)}\n`;
		await Bun.write(recordFile, recordText);
		const { output, stdout, stderr } = recordOutput();

		await runRunCommand(
			{ args, json: true, stdinIsTerminal: true },
			{
				output,
				requireCase: loadsAuditLog().requireCase,
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				executeSession: neverASession,
				execute: () => Promise.resolve({ kind: "debug" as const, recordFile }),
			},
		);

		expect(stdout.join("")).toBe(recordText);
		expect(stdout.join("")).toBe(await Bun.file(recordFile).text());
		expect(stderr).toEqual([]);
	});
});

describe(buildConfirmationRequest.name, () => {
	const loadedSettings = {
		json: "{}",
		hashed: { path: "/control/stage-settings.json", sha256: "a".repeat(64) },
	};

	it("names the case the loaded case declares", () => {
		const followUp: BenchmarkCase = {
			...auditLogCase,
			declaration: { ...auditLogCase.declaration, id: "audit-log-follow-up" },
		};

		const request = buildConfirmationRequest({
			corpusSource: { kind: "live", root: "/live", backingRoot: "/backing" },
			benchmarkCase: followUp,
			config: {
				...parseArgs(
					args,
					{},
					{
						caseId: "audit-log-follow-up",
						pipelinePath: auditLogCase.pipelinePath,
						targetPath: auditLogCase.targetPath,
					},
				),
				caseId: "audit-log-follow-up",
			},
			confirmation: {
				reps: 2,
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 1,
					totalMaximumUsd: 2,
				},
				approvalMethod: "yes",
			},
			controlSha: "a".repeat(40),
			source: { root: "/target", sha: "b".repeat(40), origin: undefined },
			instructions: "Frozen instructions\n",
			loadedSettings,
		});

		expect(request.caseId).toBe("audit-log-follow-up");
	});

	it("searches the target's corpus layout, not the control repository's", () => {
		const request = buildConfirmationRequest({
			corpusSource: { kind: "live", root: "/live", backingRoot: "/backing" },
			benchmarkCase: auditLogCase,
			config: parseArgs(
				args,
				{},
				{
					caseId: "audit-log",
					pipelinePath: auditLogCase.pipelinePath,
					targetPath: auditLogCase.targetPath,
				},
			),
			confirmation: {
				reps: 2,
				projectedCost: { reps: 2, perRepMaximumUsd: 1, totalMaximumUsd: 2 },
				approvalMethod: "yes",
			},
			controlSha: "a".repeat(40),
			source: { root: "/target", sha: "b".repeat(40), origin: undefined },
			instructions: "Frozen instructions\n",
			loadedSettings,
		});

		expect(request.corpusRoots).toEqual(
			corpusLayoutRoots("/target", {
				kind: "live",
				root: "/live",
				backingRoot: "/backing",
			}),
		);
	});

	it("carries the loaded settings file through to the confirmation request", () => {
		const declaredSettings = {
			json: '{"disableAllHooks":true}',
			hashed: { path: "/control/stage-settings.json", sha256: "a".repeat(64) },
		};

		const request = buildConfirmationRequest({
			corpusSource: { kind: "live", root: "/live", backingRoot: "/backing" },
			benchmarkCase: auditLogCase,
			config: parseArgs(
				args,
				{},
				{
					caseId: "audit-log",
					pipelinePath: auditLogCase.pipelinePath,
					targetPath: auditLogCase.targetPath,
				},
			),
			confirmation: {
				reps: 2,
				projectedCost: { reps: 2, perRepMaximumUsd: 1, totalMaximumUsd: 2 },
				approvalMethod: "yes",
			},
			controlSha: "a".repeat(40),
			source: { root: "/target", sha: "b".repeat(40), origin: undefined },
			instructions: "Frozen instructions\n",
			loadedSettings: declaredSettings,
		});

		expect(request.loadedSettings).toEqual(declaredSettings);
	});
});

describe("runRunCommand for a session case", () => {
	const sessionArgs = ["--model", "haiku", "--session-budget-usd", "0.2"];

	function loadsSmoke(): RunCommandDependencies["requireCase"] {
		return () => Promise.resolve(smokeCase);
	}

	it("runs the session attempt and prints its record path", async () => {
		const { output, stdout } = recordOutput();

		await runRunCommand(
			{
				args: ["--case", "smoke", ...sessionArgs],
				json: false,
				stdinIsTerminal: false,
			},
			{
				output,
				requireCase: loadsSmoke(),
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				execute: () => Promise.reject(new Error("no pipeline here")),
				executeSession: () =>
					Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/attempt.json",
					}),
			},
		);

		expect(stdout.join("")).toBe("/runs/attempt.json\n");
	});

	it("refuses an unsupported resumed session before the model probe", async () => {
		const { output } = recordOutput();
		const paidCalls: string[] = [];

		const failure = await failureOf(
			runRunCommand(
				{
					args: ["--case", "smoke", ...sessionArgs],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					requireCase: () => Promise.resolve(resumedSmokeCase),
					assertPreflight: passingPreflight,
					probeModel: () => {
						paidCalls.push("probe");

						return Promise.resolve(missingPreflight);
					},
					execute: () => Promise.reject(new Error("no pipeline here")),
					executeSession: (config, commandOutput, loaded, boundary) =>
						executeSessionRun(config, commandOutput, loaded, {
							...boundary,
							assertSystemPromptSnapshotSupported: () =>
								Promise.reject(
									new RefusedPreconditionError(
										"Claude does not support prompt snapshot control",
									),
								),
							runDebug: () => {
								paidCalls.push("attempt");

								return Promise.reject(new Error("must not run"));
							},
						}),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(paidCalls).toEqual([]);
	});

	it("checks a supported resumed session before its model probe and attempt", async () => {
		const { output } = recordOutput();
		const events: string[] = [];

		const failure = await failureOf(
			runRunCommand(
				{
					args: ["--case", "smoke", ...sessionArgs],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					requireCase: () => Promise.resolve(resumedSmokeCase),
					assertPreflight: passingPreflight,
					probeModel: () => {
						events.push("probe");

						return Promise.resolve(missingPreflight);
					},
					execute: () => Promise.reject(new Error("no pipeline here")),
					executeSession: (config, commandOutput, loaded, boundary) =>
						executeSessionRun(config, commandOutput, loaded, {
							...boundary,
							assertSystemPromptSnapshotSupported: () => {
								events.push("capability");

								return Promise.resolve();
							},
							runDebug: () => {
								events.push("attempt");

								return Promise.reject(new Error("attempt reached"));
							},
						}),
				},
			),
		);

		expect(failure.message).toBe("attempt reached");
		expect(events).toEqual(["capability", "probe", "attempt"]);
	});

	it("refuses an unsupported resumed confirmation before its model probe and reps", async () => {
		const { output } = recordOutput();
		const paidCalls: string[] = [];

		const failure = await failureOf(
			runRunCommand(
				{
					args: [
						"--case",
						"smoke",
						...sessionArgs,
						"--confirm",
						"--reps",
						"2",
						"--yes",
					],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					requireCase: () => Promise.resolve(resumedSmokeCase),
					assertPreflight: passingPreflight,
					probeModel: () => {
						paidCalls.push("probe");

						return Promise.resolve(missingPreflight);
					},
					execute: () => Promise.reject(new Error("no pipeline here")),
					executeSession: (config, commandOutput, loaded, boundary) =>
						executeSessionRun(config, commandOutput, loaded, {
							...boundary,
							assertSystemPromptSnapshotSupported: () =>
								Promise.reject(
									new RefusedPreconditionError(
										"Claude does not support prompt snapshot control",
									),
								),
							executeAttempt: () => {
								paidCalls.push("rep");

								return Promise.reject(new Error("must not run"));
							},
						}),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(paidCalls).toEqual([]);
	});

	it("approves the whole confirmed command before the model probe and reps", async () => {
		const { output } = recordOutput();
		const runsDirectory = await testResources.createControlDirectory();
		const events: string[] = [];
		const orderedOutput = {
			stdout: output.stdout,
			stderr: (text: string) => {
				events.push(`output:${text.trim()}`);
				output.stderr(text);
			},
		};

		await runRunCommand(
			{
				args: [
					"--case",
					"smoke",
					...sessionArgs,
					"--confirm",
					"--reps",
					"2",
					"--yes",
				],
				json: false,
				stdinIsTerminal: false,
			},
			{
				output: orderedOutput,
				requireCase: loadsSmoke(),
				assertPreflight: passingPreflight,
				probeModel: () => {
					events.push("probe");

					return Promise.resolve({
						status: "COMPLETE" as const,
						call: { metrics: sessionMetrics },
					});
				},
				execute: () => Promise.reject(new Error("no pipeline here")),
				executeSession: (config, commandOutput, loaded, boundary) =>
					executeSessionRun(config, commandOutput, loaded, {
						...boundary,
						runsDirectory,
						runDebug: () =>
							Promise.reject(new Error("debug attempt must not start")),
						executeAttempt: async (plan) => {
							events.push(`rep:${String(plan.ordinal)}`);
							const transcriptFile = join(
								plan.recordDirectory,
								"transcript.jsonl",
							);
							await Bun.write(transcriptFile, "transcript\n");

							return {
								attemptDirectory: join(plan.recordDirectory, "execution"),
								reply: "OK",
								transcriptFile,
								metrics: sessionMetrics,
								outcome: "SUCCESSFUL",
								checks: [
									{ kind: "word-band", status: "PASS", detail: "1 word" },
								],
								contextManifest: undefined,
								transcriptDiagnostics: unavailableTranscriptDiagnostics,
							};
						},
					}),
			},
		);

		expect(events.slice(0, 4)).toEqual([
			"output:Projected budget: $0.50 ($0.10 preflight + 2 reps x $0.20). A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"probe",
			"rep:1",
			"rep:2",
		]);
		const [groupId] = await readdir(join(runsDirectory, "confirmations"));
		const group = parseConfirmationGroupRecord(
			await Bun.file(
				join(
					runsDirectory,
					"confirmations",
					groupId ?? "missing",
					"group.json",
				),
			).text(),
		);
		expect(group.projectedCost).toEqual({
			reps: 2,
			perRepMaximumUsd: 0.2,
			preflightMaximumUsd: 0.1,
			totalMaximumUsd: 0.5,
		});
	});

	it("halts before the session attempt when the declared model is not available", async () => {
		const { output } = recordOutput();

		const failure = await failureOf(
			runRunCommand(
				{
					args: ["--case", "smoke", ...sessionArgs],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					requireCase: loadsSmoke(),
					assertPreflight: passingPreflight,
					probeModel: () =>
						Promise.reject(
							new RefusedPreconditionError("Model haiku is not available"),
						),
					execute: () => Promise.reject(new Error("no pipeline here")),
					executeSession: (config, commandOutput, loaded, boundary) =>
						executeSessionRun(config, commandOutput, loaded, {
							...boundary,
							runDebug: () =>
								Promise.reject(new Error("a session attempt must not start")),
						}),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
	});

	it("refuses confirmation without a terminal before probing the model", async () => {
		const { output } = recordOutput();
		const probes: string[] = [];

		const failure = await failureOf(
			runRunCommand(
				{
					args: ["--case", "smoke", ...sessionArgs, "--confirm", "--reps", "2"],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					requireCase: loadsSmoke(),
					assertPreflight: passingPreflight,
					probeModel: (model) => {
						probes.push(model);

						return Promise.resolve(missingPreflight);
					},
					execute: () => Promise.reject(new Error("no pipeline here")),
					executeSession: neverASession,
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(probes).toEqual([]);
	});

	/**
	 * A skill and a global instruction file were refused here while the session
	 * path could not isolate them from the operator's install. The corpus
	 * snapshot now freezes both and the attempt overlays them, so a confirmation
	 * declaring either reaches the model probe and its reps like any other. The
	 * corpus is a control directory rather than the operator's install, so the
	 * result does not depend on what this machine has installed.
	 */
	it.each(["CLAUDE.md", "skills/build/SKILL.md"])(
		"admits global corpus input %s to a confirmation group",
		async (corpusFile) => {
			const { output } = recordOutput();
			const calls: string[] = [];
			const corpusRoot = await testResources.createControlDirectory();
			await Bun.write(join(corpusRoot, corpusFile), "declared corpus\n");
			const globalCase: SessionCase = {
				...smokeCase,
				declaration: {
					...smokeCase.declaration,
					corpusFiles: [corpusFile],
				},
				corpusFiles: [corpusFile],
			};

			await failureOf(
				runRunCommand(
					{
						args: [
							"--case",
							"smoke",
							...sessionArgs,
							"--corpus",
							corpusRoot,
							"--confirm",
							"--reps",
							"2",
							"--yes",
						],
						json: false,
						stdinIsTerminal: false,
					},
					{
						output,
						requireCase: () => Promise.resolve(globalCase),
						assertPreflight: passingPreflight,
						probeModel: () => {
							calls.push("probe");

							return Promise.resolve(missingPreflight);
						},
						execute: () => Promise.reject(new Error("no pipeline here")),
						executeSession: (config, commandOutput, loaded, boundary) =>
							executeSessionRun(config, commandOutput, loaded, {
								...boundary,
								executeAttempt: () => {
									calls.push("rep");

									return Promise.reject(new Error("rep reached"));
								},
							}),
					},
				),
			);

			expect(calls).toEqual(["probe", "rep", "rep"]);
		},
	);

	it("classifies an invalid confirmed session corpus as a usage error", async () => {
		const { output } = recordOutput();
		const runsDirectory = await testResources.createControlDirectory();
		const calls: string[] = [];
		const missingCorpus = join(runsDirectory, "missing-corpus");

		const failure = await failureOf(
			runRunCommand(
				{
					args: [
						"--case",
						"smoke",
						...sessionArgs,
						"--corpus",
						missingCorpus,
						"--confirm",
						"--reps",
						"2",
						"--yes",
					],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					requireCase: loadsSmoke(),
					assertPreflight: passingPreflight,
					probeModel: () => {
						calls.push("probe");

						return Promise.resolve(missingPreflight);
					},
					execute: () => Promise.reject(new Error("no pipeline here")),
					executeSession: (config, commandOutput, loaded, boundary) =>
						executeSessionRun(config, commandOutput, loaded, {
							...boundary,
							runsDirectory,
							executeAttempt: () => {
								calls.push("rep");

								return Promise.reject(new Error("must not run"));
							},
						}),
				},
			),
		);

		expect(failure).toBeInstanceOf(UsageError);
		expect(calls).toEqual(["probe"]);
	});

	it("classifies invalid live corpus configuration consistently for confirmation", async () => {
		const { output } = recordOutput();
		const runsDirectory = await testResources.createControlDirectory();
		const calls: string[] = [];

		const failure = await failureOf(
			runRunCommand(
				{
					args: [
						"--case",
						"smoke",
						...sessionArgs,
						"--confirm",
						"--reps",
						"2",
						"--yes",
					],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					requireCase: loadsSmoke(),
					assertPreflight: passingPreflight,
					probeModel: () => {
						calls.push("probe");

						return Promise.resolve(missingPreflight);
					},
					execute: () => Promise.reject(new Error("no pipeline here")),
					executeSession: (config, commandOutput, loaded, boundary) =>
						executeSessionRun(config, commandOutput, loaded, {
							...boundary,
							runsDirectory,
							resolveCorpus: () =>
								Promise.reject(
									new CorpusConfigurationError("invalid backing root"),
								),
							executeAttempt: () => {
								calls.push("rep");

								return Promise.reject(new Error("must not run"));
							},
						}),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("invalid backing root");
		expect(calls).toEqual(["probe"]);
	});

	it.each(["--target", "--pipeline"])(
		"refuses %s as a flag a session case does not take",
		async (flag) => {
			const { output } = recordOutput();

			const failure = await failureOf(
				runRunCommand(
					{
						args: ["--case", "smoke", ...sessionArgs, flag, "/somewhere"],
						json: false,
						stdinIsTerminal: false,
					},
					{
						output,
						requireCase: loadsSmoke(),
						assertPreflight: passingPreflight,
						probeModel: passingProbe,
						execute: () => Promise.reject(new Error("no pipeline here")),
						executeSession: neverASession,
					},
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toBe(
				`Case smoke is a session case and takes no ${flag}`,
			);
		},
	);

	it("needs no terminal, because a session attempt has no review pause", async () => {
		const { output, stdout } = recordOutput();

		await runRunCommand(
			{
				args: ["--case", "smoke", ...sessionArgs],
				json: false,
				stdinIsTerminal: false,
			},
			{
				output,
				requireCase: loadsSmoke(),
				assertPreflight: passingPreflight,
				probeModel: passingProbe,
				execute: () => Promise.reject(new Error("no pipeline here")),
				executeSession: () =>
					Promise.resolve({
						kind: "debug" as const,
						recordFile: "/runs/attempt.json",
					}),
			},
		);

		expect(stdout.join("")).toContain("attempt.json");
	});
});

describe("--corpus on a pipeline case", () => {
	/**
	 * A pipeline stage's corpus is the skill it invokes, so there is no second
	 * skill for a source to supply: the flag has nothing to mean on this path.
	 * A session case is where a corpus variant is measured.
	 */
	it("refuses before the run starts, saying a stage's corpus is its own skill", async () => {
		const { output, stdout, stderr } = recordOutput();

		const failure = await failureOf(
			runRunCommand(
				{
					args: [...args, "--corpus", "/some/corpus"],
					json: false,
					stdinIsTerminal: true,
				},
				{
					output,
					requireCase: loadsAuditLog().requireCase,
					assertPreflight: passingPreflight,
					probeModel: passingProbe,
					executeSession: neverASession,
					execute: () => Promise.reject(new Error("run must not start")),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(
			"A stage's corpus is the skill it invokes",
		);
		expect(stdout).toEqual([]);
		expect(stderr).toEqual([]);
	});
});
