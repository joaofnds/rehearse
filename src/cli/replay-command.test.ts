import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTROL_DIR, parseArgs, parseReplayArgs } from "#benchmark/config";
import { corpusLayoutRoots } from "#benchmark/checkpoint";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { buildRunManifest } from "#benchmark/run";
import { writeRunManifest } from "#benchmark/manifest";
import {
	benchmarkRunPaths,
	benchmarkRunsDirectory,
} from "#benchmark/run-layout";
import {
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
} from "#benchmark/test-support";
import { loadPipeline } from "#benchmark/pipeline";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import type { ReplayCliConfig } from "#benchmark/config";
import {
	executeReplay,
	replayCorpus,
	replayCorpusRoots,
	replaySettingsFile,
	runReplayCommand,
} from "#cli/replay-command";
import { CorpusConfigurationError } from "#benchmark/corpus-file";
import { DEFAULT_STAGE_SETTINGS_FILE } from "#benchmark/stage-settings";

const sessionArgs = [
	"--model",
	"sonnet",
	"--judge-model",
	"opus",
	"--session-budget-usd",
	"1",
];

const passingProbe = (): Promise<void> => Promise.resolve();

/**
 * Replay now reads the run's own manifest to find the case it replayed, so a
 * test claiming a run named "any-name" resolved must leave a real manifest at
 * the path replay computes for it, not just a Fake resolveRunDirectory.
 */
function replayConfigFor(runName: string, corpus: string): ReplayCliConfig {
	return parseReplayArgs([
		"--run",
		runName,
		"--stage",
		"shape",
		"--corpus",
		corpus,
		...sessionArgs,
	]);
}

async function writeManifestFor(runName: string): Promise<string> {
	const paths = benchmarkRunPaths(benchmarkRunsDirectory(CONTROL_DIR), runName);
	const config = parseArgs(
		["--target", "/tmp/target", ...sessionArgs],
		{},
		{
			caseId: "audit-log",
			pipelinePath: AUDIT_LOG_PIPELINE_PATH,
			targetPath: "/tmp/target",
		},
	);
	const pipeline = await loadPipeline(
		AUDIT_LOG_PIPELINE_PATH,
		AUDIT_LOG_RUBRICS_PATH,
	);
	const manifest = buildRunManifest({
		timestamp: "2026-09-02T00:00:00.000Z",
		controlSha: "control-sha",
		source: { root: "/tmp/target", sha: "source-sha" },
		taskId: "TASK-1",
		taskSha: "task-sha",
		task: "Task",
		productBrief: "Brief",
		config,
		pipeline,
	});

	await writeRunManifest(paths.manifestFile, manifest);

	return paths.manifestFile;
}

describe(runReplayCommand.name, () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { force: true, recursive: true })),
		);
	});

	it("refuses a confirmation without --yes before resolving the run, when stdin is not a terminal", async () => {
		const resolved: string[] = [];
		const { output, stdout, stderr } = recordOutput();

		const failure = await failureOf(
			runReplayCommand(
				{
					args: [
						"--run",
						"any-name",
						"--stage",
						"shape",
						...sessionArgs,
						"--confirm",
					],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					resolveRunDirectory: (name) => {
						resolved.push(name);

						return Promise.resolve("/runs/any-name");
					},
					probeModel: passingProbe,
					execute: () => Promise.reject(new Error("replay must not run")),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(resolved).toEqual([]);
		expect(stdout).toEqual([]);
		expect(stderr.join("")).not.toContain("Projected budget");
	});

	it("does not check for a terminal when --yes answers the approval", async () => {
		const resolved: string[] = [];
		const { output } = recordOutput();

		const failure = await failureOf(
			runReplayCommand(
				{
					args: [
						"--run",
						"any-name",
						"--stage",
						"shape",
						...sessionArgs,
						"--confirm",
						"--yes",
					],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					resolveRunDirectory: (name) => {
						resolved.push(name);

						return Promise.reject(new Error(`No replayable run named ${name}`));
					},
					probeModel: passingProbe,
					execute: () => Promise.reject(new Error("replay must not run")),
				},
			),
		);

		expect(failure).not.toBeInstanceOf(RefusedPreconditionError);
		expect(String(failure)).toContain("No replayable run named any-name");
		expect(resolved).toEqual(["any-name"]);
	});

	it("does not check for a terminal for a single debug rep", async () => {
		const resolved: string[] = [];
		const { output } = recordOutput();

		const failure = await failureOf(
			runReplayCommand(
				{
					args: ["--run", "any-name", "--stage", "shape", ...sessionArgs],
					json: false,
					stdinIsTerminal: false,
				},
				{
					output,
					resolveRunDirectory: (name) => {
						resolved.push(name);

						return Promise.reject(new Error(`No replayable run named ${name}`));
					},
					probeModel: passingProbe,
					execute: () => Promise.reject(new Error("replay must not run")),
				},
			),
		);

		expect(failure).not.toBeInstanceOf(RefusedPreconditionError);
		expect(resolved).toEqual(["any-name"]);
	});

	it("halts before executing when the declared model is not available", async () => {
		const executed: string[] = [];
		const { output } = recordOutput();
		const manifestFile = await writeManifestFor("any-name-bad-model");

		try {
			const failure = await failureOf(
				runReplayCommand(
					{
						args: [
							"--run",
							"any-name-bad-model",
							"--stage",
							"shape",
							...sessionArgs,
						],
						json: false,
						stdinIsTerminal: true,
					},
					{
						output,
						resolveRunDirectory: () => Promise.resolve("/runs/any-name"),
						probeModel: () =>
							Promise.reject(
								new RefusedPreconditionError("Model sonnet is not available"),
							),
						execute: () => {
							executed.push("executed");

							return Promise.reject(new Error("replay must not run"));
						},
					},
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(executed).toEqual([]);
		} finally {
			await rm(manifestFile, { force: true });
		}
	});

	it("prints the replay record's exact bytes on stdout with --json", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-replay-json-"));
		temporaryDirectories.push(directory);
		const recordPath = join(directory, "replay.json");
		const recordText = `${JSON.stringify({ schemaVersion: 1, stage: "shape" }, null, 2)}\n`;
		await Bun.write(recordPath, recordText);
		temporaryDirectories.push(await writeManifestFor("any-name-json"));
		const { output, stdout } = recordOutput();

		await runReplayCommand(
			{
				args: ["--run", "any-name-json", "--stage", "shape", ...sessionArgs],
				json: true,
				stdinIsTerminal: false,
			},
			{
				output,
				resolveRunDirectory: () => Promise.resolve("/runs/any-name"),
				probeModel: passingProbe,
				execute: (_config, _paths, commandOutput) => {
					commandOutput.stderr("Replay progress\n");

					return Promise.resolve({
						kind: "debug" as const,
						evidence: { recordPath, lineage: "lineage-1" },
					});
				},
			},
		);

		expect(stdout.join("")).toBe(recordText);
		expect(stdout.join("")).toBe(await Bun.file(recordPath).text());
	});
});

describe(replayCorpus.name, () => {
	it("retains the captured live source alongside its instructions", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-live-source-"));
		const source = {
			kind: "live",
			root,
			backingRoot: join(root, "backing"),
		} as const;
		await Bun.write(join(root, "CLAUDE.md"), "captured instructions\n");

		try {
			const corpus = await replayCorpus(undefined, () =>
				Promise.resolve(source),
			);

			expect(corpus).toEqual({
				instructions: "captured instructions\n",
				source,
				settingSources: undefined,
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("classifies invalid live corpus configuration as a refused precondition", async () => {
		const failure = await failureOf(
			replayCorpus(undefined, () =>
				Promise.reject(new CorpusConfigurationError("invalid backing root")),
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("invalid backing root");
	});
});

describe(replayCorpusRoots.name, () => {
	it("searches the replayed run's own target, not the control repository's", async () => {
		const manifestFile = await writeManifestFor("any-name-corpus-roots");

		try {
			expect(
				await replayCorpusRoots(manifestFile, {
					kind: "live",
					root: "/live",
					backingRoot: "/backing",
				}),
			).toEqual(
				corpusLayoutRoots("/tmp/target", {
					kind: "live",
					root: "/live",
					backingRoot: "/backing",
				}),
			);
		} finally {
			await rm(manifestFile, { force: true });
		}
	});
});

describe(replaySettingsFile.name, () => {
	it("loads the settings file the replayed run's case declares today", async () => {
		const manifestFile = await writeManifestFor("any-name-settings-file");

		try {
			const settingsFile = await replaySettingsFile(manifestFile);

			expect(settingsFile.hashed.path).toBe(DEFAULT_STAGE_SETTINGS_FILE);
		} finally {
			await rm(manifestFile, { force: true });
		}
	});
});

describe("--corpus on a stage replay", () => {
	/**
	 * A project-level skill shadows the user-level one under
	 * --setting-sources project, so a replay can be given a corpus source and
	 * the stage reads the bytes the lineage records.
	 */
	it("carries the corpus source through to the replay", async () => {
		const corpora: (string | undefined)[] = [];
		const { output } = recordOutput();
		const manifestFile = await writeManifestFor("any-name-corpus");

		try {
			await runReplayCommand(
				{
					args: [
						"--run",
						"any-name-corpus",
						"--stage",
						"shape",
						...sessionArgs,
						"--corpus",
						"/some/corpus",
					],
					json: false,
					stdinIsTerminal: true,
				},
				{
					output,
					resolveRunDirectory: () => Promise.resolve("/runs/any-name"),
					probeModel: passingProbe,
					execute: (config) => {
						corpora.push(config.corpus);

						return Promise.resolve({
							kind: "debug" as const,
							evidence: {
								recordPath: "/runs/replay.json",
								lineage: "lineage-1",
							},
						});
					},
				},
			);

			expect(corpora).toEqual(["/some/corpus"]);
		} finally {
			await rm(manifestFile, { force: true });
		}
	});
	it("refuses a corpus whose CLAUDE.md is a symlink out of the root, as a precondition", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-replay-corpus-"));
		const outside = await mkdtemp(join(tmpdir(), "rehearse-replay-outside-"));
		const manifestFile = await writeManifestFor("any-name-corpus-linked");

		try {
			await mkdir(join(root, "skills"), { recursive: true });
			await Bun.write(join(outside, "secret.md"), "SECRET BYTES\n");
			await symlink(join(outside, "secret.md"), join(root, "CLAUDE.md"));

			const failure = await failureOf(
				executeReplay(
					replayConfigFor("any-name-corpus-linked", root),
					benchmarkRunPaths(
						benchmarkRunsDirectory(CONTROL_DIR),
						"any-name-corpus-linked",
					),
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).not.toContain("SECRET BYTES");
		} finally {
			await rm(manifestFile, { force: true });
			await rm(root, { force: true, recursive: true });
			await rm(outside, { force: true, recursive: true });
		}
	});
});
