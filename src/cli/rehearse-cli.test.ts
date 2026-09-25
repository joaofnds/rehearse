import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { ComparisonEvidenceFixture } from "#benchmark/comparison-evidence-test-support";
import {
	parseComparisonManifest,
	parseComparisonReport,
} from "#benchmark/comparison-record";
import { runCommand } from "#benchmark/command";
import {
	CONTROL_DIR,
	RECORDS_DIRECTORY_VARIABLE,
	recordsDirectory,
} from "#benchmark/config";
import {
	benchmarkRunsDirectory,
	comparisonReportPaths,
} from "#benchmark/run-layout";
import { COMMANDS } from "#cli/commands";
import { EXIT_CODES } from "#benchmark/exit-codes";
import { PROJECT_ROOT } from "#benchmark/test-support";

const PIPE_BUFFER_BYTES = 131_072;

interface CliResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * The session knobs read an environment fallback, so a `BENCHMARK_MODEL` set on
 * the machine running the suite would change which refusal a command makes.
 * The child gets an environment with none of them, so every assertion below is
 * about the code rather than about this shell.
 */
function environmentWithoutKnobs(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(Bun.env)
			.filter(([name]) => !name.startsWith("BENCHMARK_"))
			.map(([name, value]) => [name, value ?? ""]),
	);
}

async function runCli(
	args: readonly string[],
	stdin: "inherit" | "empty" = "empty",
): Promise<CliResult> {
	const child = Bun.spawn([process.execPath, "rehearse.ts", ...args], {
		cwd: PROJECT_ROOT,
		env: environmentWithoutKnobs(),
		stdin: stdin === "empty" ? new Blob([""]) : "inherit",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return { exitCode, stdout, stderr };
}

/**
 * A copied control keeps its records under its own .benchmark-runs, which is
 * where recordRunFor looks for them, so its child gets no records location.
 */
function environmentWithoutRecordsLocation(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(environmentWithoutKnobs()).filter(
			([name]) => name !== RECORDS_DIRECTORY_VARIABLE,
		),
	);
}

async function runPipelineCli(
	args: readonly string[],
	control: string,
	binDirectory: string,
): Promise<CliResult> {
	const child = Bun.spawn([process.execPath, "rehearse.ts", ...args], {
		cwd: control,
		env: {
			...environmentWithoutRecordsLocation(),
			PATH: `${binDirectory}:${Bun.env["PATH"] ?? ""}`,
		},
		stdin: new Blob([""]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return { exitCode, stdout, stderr };
}

async function runPackageScript(args: readonly string[]): Promise<CliResult> {
	const child = Bun.spawn([process.execPath, "run", "rehearse", ...args], {
		cwd: PROJECT_ROOT,
		env: environmentWithoutKnobs(),
		stdin: new Blob([""]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return { exitCode, stdout, stderr };
}

/**
 * A pipe whose reader is not already draining is what exposes an unflushed
 * stdout: the writer blocks once the buffer fills, and an exit that does not
 * wait for the drain loses the rest. `Bun.spawn` alone reads eagerly enough to
 * hide it, so the record travels through a real shell pipe.
 */
async function runCliThroughPipe(args: readonly string[]): Promise<string> {
	const quoted = args.map((argument) => `'${argument}'`).join(" ");
	const child = Bun.spawn(
		["sh", "-c", `'${process.execPath}' rehearse.ts ${quoted} | cat`],
		{
			cwd: PROJECT_ROOT,
			env: { ...Bun.env },
			stdin: new Blob([""]),
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stdout] = await Promise.all([
		new Response(child.stdout).text(),
		child.exited,
	]);

	return stdout;
}

/**
 * One fixture writes two cases, whose report is smaller than the 131072-byte
 * pipe buffer. Composing several fixture roots into one manifest crosses that
 * buffer, which is what a truncated write is observable against.
 */
async function writeOversizedManifest(
	roots: readonly string[],
): Promise<string> {
	const cases = [];
	for (const root of roots) {
		const fixture = new ComparisonEvidenceFixture(root, [
			`case-1-${basename(root)}`,
			`case-2-${basename(root)}`,
		]);
		await fixture.write();
		const manifest = parseComparisonManifest(
			await Bun.file(fixture.manifestFile).text(),
		);
		for (const benchmarkCase of manifest.cases) {
			cases.push({
				caseId: benchmarkCase.caseId,
				arms: {
					baseline: join(root, benchmarkCase.arms.baseline),
					candidate: join(root, benchmarkCase.arms.candidate),
					control: join(root, benchmarkCase.arms.control),
				},
			});
		}
	}
	const manifestFile = join(roots[0] ?? "", "oversized-comparison.json");
	await Bun.write(
		manifestFile,
		`${JSON.stringify({ schemaVersion: 1, cases }, null, 2)}\n`,
	);

	return manifestFile;
}

/**
 * A `claude` earlier on PATH than the real one, so a pipeline run reaches its
 * stages without a paid call. `runCommand` spreads `Bun.env` into every child,
 * so anything named `claude` ahead of the provider shadows it for the whole
 * process tree, which is why the shim stays in a directory the test removes.
 */
async function providerShim(directory: string): Promise<string> {
	const binDirectory = join(directory, "bin");
	await mkdir(binDirectory, { recursive: true });
	const shim = join(binDirectory, "claude");
	const envelope = JSON.stringify({
		type: "result",
		subtype: "success",
		is_error: false,
		result: JSON.stringify({ status: "COMPLETE", message: "done" }),
		total_cost_usd: 0,
		duration_ms: 1,
		duration_api_ms: 1,
		num_turns: 1,
		session_id: "fake",
		usage: {
			input_tokens: 1,
			output_tokens: 1,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 0,
		},
	});
	await Bun.write(
		shim,
		[
			"#!/bin/sh",
			'for argument in "$@"; do',
			'\tcase "$argument" in',
			"\t\t--version) echo '1.0.0 (Claude Code)'; exit 0 ;;",
			"\t\t--help) echo '--print --model --settings --append-system-prompt --permission-mode --allowedTools --add-dir --output-format --session-id --resume --strict-mcp-config --mcp-config --agents'; exit 0 ;;",
			"\tesac",
			"done",
			"cat >/dev/null",
			`cat <<'ENVELOPE'`,
			envelope,
			"ENVELOPE",
			"",
		].join("\n"),
	);
	await chmod(shim, 0o755);

	return binDirectory;
}

/**
 * A committed copy of the working tree, so `assertControlReady` reads the copy
 * rather than the checkout the suite runs from. Without it this test would be
 * red for anyone holding an uncommitted edit, which is the ordinary state while
 * developing. The copy carries untracked files too, so an in-progress change is
 * what gets exercised.
 */
async function controlCopy(directory: string): Promise<string> {
	const control = join(directory, "control");
	await mkdir(control, { recursive: true });
	await runCommand(
		[
			"sh",
			"-c",
			"{ git ls-files -z; git ls-files -z --others --exclude-standard; } " +
				`| tar --null -cf - -T - | tar -xf - -C '${control}'`,
		],
		PROJECT_ROOT,
	);
	await runCommand(
		["ln", "-s", join(PROJECT_ROOT, "node_modules"), "node_modules"],
		control,
	);
	await runCommand(["git", "init", "-b", "main"], control);
	await runCommand(["git", "config", "user.email", "t@example.com"], control);
	await runCommand(["git", "config", "user.name", "Stdout Contract"], control);
	await runCommand(["git", "add", "-A"], control);
	await runCommand(["git", "commit", "-m", "chore: control copy"], control);

	return control;
}

/**
 * A target whose declared checks all succeed, so the run reaches its stages
 * instead of refusing at the baseline. audit-log names the three scripts; what
 * they do is beside the point for a stream contract.
 */
async function passingTarget(directory: string): Promise<string> {
	const target = join(directory, "target");
	await mkdir(target, { recursive: true });
	await Bun.write(
		join(target, "package.json"),
		`${JSON.stringify(
			{
				name: "stdout-contract-target",
				scripts: { typecheck: "true", check: "true", "test:unit": "true" },
			},
			null,
			2,
		)}\n`,
	);
	await Bun.write(join(target, "tsconfig.json"), "{}\n");
	await Bun.write(join(target, "biome.json"), "{}\n");
	await runCommand(["git", "init", "-b", "main"], target);
	await runCommand(["git", "config", "user.email", "t@example.com"], target);
	await runCommand(["git", "config", "user.name", "Stdout Contract"], target);
	await runCommand(["git", "add", "-A"], target);
	await runCommand(["git", "commit", "-m", "chore: base"], target);

	return target;
}

/**
 * A run far enough along to replay: the provider shim fails it at the first
 * stage judge, but the checkpoint chain and manifest a replay consumes are
 * already on disk by then. Returns the run's name.
 */
async function recordRunFor(
	control: string,
	binDirectory: string,
	target: string,
): Promise<string> {
	await runPipelineCli(
		[
			"run",
			"--case",
			"audit-log",
			"--model",
			"sonnet",
			"--target",
			target,
			"--json",
		],
		control,
		binDirectory,
	);
	const runsDirectory = benchmarkRunsDirectory(control);
	const entries = await readdir(runsDirectory);
	const recorded = entries
		.filter((entry) => entry.endsWith(".checkpoints"))
		.map((entry) => entry.replace(/\.checkpoints$/u, ""))
		.toSorted();
	const name = recorded.at(-1);
	if (name === undefined) {
		throw new Error(`No recorded run under ${runsDirectory}`);
	}

	return name;
}

/**
 * The directories a failed replay keeps on purpose, named on its own stderr.
 * This test drives a replay to failure, so without collecting them every run
 * leaves a worktree behind in the system temp directory.
 */
function preservedEvidenceIn(stderr: string): readonly string[] {
	return [...stderr.matchAll(/evidence preserved at (?<directory>\S+)/gu)].map(
		(match) => dirname(match.groups?.["directory"] ?? ""),
	);
}

async function headSha(repository: string): Promise<string> {
	const sha = await runCommand(["git", "rev-parse", "HEAD"], repository);

	return sha.trim();
}

/**
 * The confirmation report, found through the group record the command names on
 * its own stderr. Reading it from stdout instead would assume the very thing
 * this test is here to check.
 */
function reportBesideGroupIn(stderr: string): string {
	const group = /Confirmation group: (?<file>\S+)/u.exec(stderr)?.groups?.[
		"file"
	];
	if (group === undefined) {
		throw new Error(`no confirmation group on stderr:\n${stderr}`);
	}

	return join(dirname(group), "report.json");
}

interface PipelineFixture {
	readonly control: string;
	readonly binDirectory: string;
	readonly target: string;
}

/**
 * Everything a pipeline command needs to run without a paid call: a committed
 * control copy, a `claude` shim ahead of the real one, and a target whose
 * declared checks pass. The caller registers `directory` for removal, which
 * takes all three with it.
 */
async function pipelineFixture(directory: string): Promise<PipelineFixture> {
	const [control, binDirectory, target] = await Promise.all([
		controlCopy(directory),
		providerShim(directory),
		passingTarget(directory),
	]);

	return { control, binDirectory, target };
}

describe("rehearse", () => {
	const temporaryDirectories: string[] = [];
	let writtenReportDirectory: string | undefined;

	afterEach(async () => {
		if (writtenReportDirectory !== undefined) {
			await rm(writtenReportDirectory, { force: true, recursive: true });
			writtenReportDirectory = undefined;
		}
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { force: true, recursive: true })),
		);
	});

	it("lists every command and the exit-code meanings in the top-level help", async () => {
		const result = await runCli(["--help"]);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		for (const command of COMMANDS) {
			expect(result.stdout).toContain(command.name);
			expect(result.stdout).toContain(command.summary);
		}
		expect(result.stdout).toContain("2  usage error");
		expect(result.stdout).toContain("3  refused precondition");
	});

	it("runs the supported package script", async () => {
		const result = await runPackageScript(["--help"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage: rehearse <command>");
		const [echoedLine, ...extraLines] = result.stderr.trimEnd().split("\n");
		expect(echoedLine).toContain("run rehearse.ts --help");
		expect(extraLines).toEqual([]);
	});

	it.each(COMMANDS.map((command) => command.name))(
		"prints the flag table for rehearse %s --help",
		async (name) => {
			const command = COMMANDS.find((candidate) => candidate.name === name);
			const result = await runCli([...name.split(" "), "--help"]);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			for (const flag of command?.flags ?? []) {
				expect(result.stdout).toContain(flag.name);
				expect(result.stdout).toContain(flag.help);
				if (flag.envVar !== undefined) {
					expect(result.stdout).toContain(flag.envVar);
				}
			}
		},
	);

	it("prints the top-level help on stderr and exits 2 with no command", async () => {
		const result = await runCli([]);

		expect(result.exitCode).toBe(2);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Usage: rehearse <command>");
		for (const command of COMMANDS) {
			expect(result.stderr).toContain(command.name);
		}
	});

	it("prints only the report path for a valid manifest, and nothing on stdout otherwise", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-cli-compare-"));
		temporaryDirectories.push(directory);
		const fixture = new ComparisonEvidenceFixture(directory);
		await fixture.write();
		const manifestSha = createHash("sha256")
			.update(await Bun.file(fixture.manifestFile).text())
			.digest("hex");
		const { directory: reportDirectory, reportFile } = comparisonReportPaths(
			recordsDirectory(),
			manifestSha,
		);
		writtenReportDirectory = reportDirectory;

		const result = await runCli(["compare", fixture.manifestFile]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe(`${reportFile}\n`);
		expect(result.stderr).toBe("");
	});

	it("prints exactly the report JSON on stdout with --json", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-cli-compare-"));
		temporaryDirectories.push(directory);
		const fixture = new ComparisonEvidenceFixture(directory);
		await fixture.write();
		const manifestSha = createHash("sha256")
			.update(await Bun.file(fixture.manifestFile).text())
			.digest("hex");
		const { directory: reportDirectory, reportFile } = comparisonReportPaths(
			recordsDirectory(),
			manifestSha,
		);
		writtenReportDirectory = reportDirectory;

		const result = await runCli(["compare", fixture.manifestFile, "--json"]);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toBe(await Bun.file(reportFile).text());
		expect(parseComparisonReport(result.stdout).cases).toHaveLength(2);
		expect(JSON.parse(result.stdout)).toEqual(
			JSON.parse(await Bun.file(reportFile).text()),
		);
	});

	it("delivers a record larger than the pipe buffer whole on stdout", async () => {
		const roots = await Promise.all(
			[1, 2, 3, 4, 5, 6].map((ordinal) =>
				mkdtemp(join(tmpdir(), `rehearse-cli-oversized-${ordinal}-`)),
			),
		);
		temporaryDirectories.push(...roots);
		const manifestFile = await writeOversizedManifest(roots);
		const manifestSha = createHash("sha256")
			.update(await Bun.file(manifestFile).text())
			.digest("hex");
		const { directory: reportDirectory, reportFile } = comparisonReportPaths(
			recordsDirectory(),
			manifestSha,
		);
		writtenReportDirectory = reportDirectory;

		const piped = await runCliThroughPipe(["compare", manifestFile, "--json"]);

		const written = await Bun.file(reportFile).text();
		expect(written.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
		expect(piped.length).toBe(written.length);
		expect(piped).toBe(written);
		expect(parseComparisonReport(piped).cases).toHaveLength(12);
	});

	it("writes a spawned CLI's comparison report outside the operator's records directory", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-cli-compare-"));
		temporaryDirectories.push(directory);
		const fixture = new ComparisonEvidenceFixture(directory);
		await fixture.write();

		const stdout = await runCliThroughPipe(["compare", fixture.manifestFile]);

		const reportFile = stdout.trim();
		writtenReportDirectory = dirname(reportFile);

		expect(reportFile).toEndWith("report.json");
		expect(reportFile).not.toStartWith(benchmarkRunsDirectory(CONTROL_DIR));
		expect(reportFile).not.toStartWith(".benchmark-runs");
	});

	it("writes a comparison report under the control's .benchmark-runs when nothing overrides the records location", async () => {
		const directory = await mkdtemp(
			join(tmpdir(), "rehearse-cli-default-records-"),
		);
		temporaryDirectories.push(directory);
		const control = await controlCopy(directory);
		const fixture = new ComparisonEvidenceFixture(directory);
		await fixture.write();

		const result = await runPipelineCli(
			["compare", fixture.manifestFile],
			control,
			join(directory, "bin"),
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toStartWith(
			join(await realpath(control), ".benchmark-runs", "comparisons"),
		);
	});

	it("refuses an empty records location with a usage exit code", async () => {
		const child = Bun.spawn([process.execPath, "rehearse.ts", "list", "runs"], {
			cwd: PROJECT_ROOT,
			env: { ...environmentWithoutKnobs(), [RECORDS_DIRECTORY_VARIABLE]: "" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stderr] = await Promise.all([
			child.exited,
			new Response(child.stderr).text(),
		]);

		expect(stderr).toContain("REHEARSE_RECORDS_DIR is empty");
		expect(exitCode).toBe(EXIT_CODES.usageError);
	});

	it("refuses an unknown flag by name, with a usage exit code and no stdout", async () => {
		const result = await runCli(["run", "--bogus"]);

		expect(result.exitCode).toBe(2);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("--bogus");
		expect(result.stderr.trim().split("\n")).toHaveLength(1);
	});

	it("refuses a confirmation replay without --yes when stdin is not a terminal", async () => {
		const result = await runCli([
			"replay",
			"--run",
			"any-name",
			"--stage",
			"shape",
			"--model",
			"sonnet",
			"--session-budget-usd",
			"1",
			"--confirm",
		]);

		expect(result.exitCode).toBe(3);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("stdin is not a terminal");
		expect(result.stderr).not.toContain("Projected budget");
		expect(result.stderr).not.toContain("No replayable run named");
	});

	it("does not refuse for a terminal when --yes answers the approval", async () => {
		const result = await runCli([
			"replay",
			"--run",
			"any-name",
			"--stage",
			"shape",
			"--model",
			"sonnet",
			"--session-budget-usd",
			"1",
			"--confirm",
			"--yes",
		]);

		expect(result.exitCode).toBe(3);
		expect(result.stdout).toBe("");
		expect(result.stderr).not.toContain("stdin is not a terminal");
		expect(result.stderr).toContain("No replayable run named any-name");
	});

	it("refuses --pause when stdin is not a terminal, before any provider call", async () => {
		const result = await runCli([
			"run",
			"--pause",
			"--target",
			"/nonexistent-target",
			"--model",
			"sonnet",
			"--session-budget-usd",
			"1",
		]);

		expect(result.exitCode).toBe(3);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("stdin is not a terminal");
		expect(result.stderr).toContain("--pause");
		expect(result.stderr).not.toContain("Target:");
	});

	/**
	 * A case declaring the model means nothing the operator typed authorizes the
	 * spend, so a bare `run` is held to a TTY or an explicit --model. Before the
	 * declaration existed the missing --model refused this invocation; the guard
	 * replaces that refusal rather than letting a paid run start from a bare
	 * command or from the suite.
	 */
	it("refuses a run authorized only by the case declaration when stdin is not a terminal", async () => {
		const result = await runCli(["run"]);

		expect(result.exitCode).toBe(EXIT_CODES.refusedPrecondition);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("stdin is not a terminal");
		expect(result.stderr).toContain("--model");
	});

	/**
	 * The guard asks who authorized the spend, not how much it is. Naming the
	 * model is the operator saying so, which is why the run below passes the
	 * gate while the bare one above does not.
	 */
	it("passes the declaration gate when the model is named on the command line", async () => {
		const result = await runCli([
			"run",
			"--target",
			"/nonexistent-target",
			"--model",
			"sonnet",
			"--session-budget-usd",
			"1",
		]);

		expect(result.stderr).not.toContain("authorizes the spend");
	});

	/**
	 * The terminal gate belongs to `--pause` alone now, so a run without it
	 * reaches the work and fails on the state it finds (here, the preflight gate
	 * refusing a target that is not there) rather than on a pause it never asked
	 * for. What the run then fails on depends on the machine, so only the
	 * refusal it must not make is asserted.
	 */
	it("passes the terminal gate without --pause", async () => {
		const result = await runCli([
			"run",
			"--target",
			"/nonexistent-target",
			"--model",
			"sonnet",
			"--session-budget-usd",
			"1",
		]);

		expect(result.stdout).toBe("");
		expect(result.stderr).not.toContain("stdin is not a terminal");
	});

	it.each([
		{
			condition: "a flag needs a value it was not given",
			args: ["run", "--session-budget-usd"],
			message: "Flag --session-budget-usd needs a value",
		},
		{
			condition: "a flag value is unparseable",
			args: [
				"run",
				"--target",
				"/nonexistent",
				"--model",
				"sonnet",
				"--effort",
				"extreme",
				"--session-budget-usd",
				"1",
			],
			message: "Unsupported effort for workflow: extreme",
		},
		{
			condition: "a flag is given no value",
			args: ["run", "--model"],
			message: "Flag --model needs a value",
		},
	])(
		"exits 2 with the reason on stderr when $condition",
		async ({ args, message }) => {
			const result = await runCli(args);

			expect(result.exitCode).toBe(2);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(message);
		},
	);

	it("keeps every pipeline diagnostic off stdout on a run reaching its stages", async () => {
		const directory = await mkdtemp(
			join(tmpdir(), "rehearse-stdout-contract-"),
		);
		temporaryDirectories.push(directory);
		const { control, binDirectory, target } = await pipelineFixture(directory);

		const result = await runPipelineCli(
			[
				"run",
				"--case",
				"audit-log",
				"--model",
				"sonnet",
				"--target",
				target,
				"--json",
			],
			control,
			binDirectory,
		);

		expect(result.stdout).toBe("");
		expect(result.stderr).toContain(`Target: ${await realpath(target)}`);
		expect(result.stderr).toContain("Baseline checks");
		expect(result.stderr).toContain(
			`Target restored to ${await headSha(target)}.`,
		);
		expect(result.exitCode).toBe(EXIT_CODES.executionFailure);
	});

	it("keeps every replay diagnostic off stdout on a recorded run", async () => {
		const directory = await mkdtemp(
			join(tmpdir(), "rehearse-replay-contract-"),
		);
		temporaryDirectories.push(directory);
		const { control, binDirectory, target } = await pipelineFixture(directory);
		const recorded = await recordRunFor(control, binDirectory, target);

		const result = await runPipelineCli(
			[
				"replay",
				"--run",
				recorded,
				"--stage",
				"shape",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"1",
				"--json",
			],
			control,
			binDirectory,
		);

		temporaryDirectories.push(...preservedEvidenceIn(result.stderr));

		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Checkpoint chain is fresh");
		expect(result.stderr).toContain("shape stage Judge");
		expect(result.stderr).toContain("evidence preserved at");
		expect(result.exitCode).toBe(EXIT_CODES.executionFailure);
	});

	it("puts the confirmation report's own bytes on stdout and nothing else", async () => {
		const directory = await mkdtemp(
			join(tmpdir(), "rehearse-record-contract-"),
		);
		temporaryDirectories.push(directory);
		const { control, binDirectory, target } = await pipelineFixture(directory);

		const result = await runPipelineCli(
			[
				"run",
				"--case",
				"audit-log",
				"--model",
				"sonnet",
				"--target",
				target,
				"--confirm",
				"--yes",
				"--reps",
				"2",
				"--json",
			],
			control,
			binDirectory,
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe(
			await Bun.file(reportBesideGroupIn(result.stderr)).text(),
		);
		expect(result.stderr).toContain("Target setup");
		expect(result.stderr).toContain("Baseline checks");
	});

	it("puts the replay report's own bytes on stdout and nothing else", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-replay-record-"));
		temporaryDirectories.push(directory);
		const { control, binDirectory, target } = await pipelineFixture(directory);
		const recorded = await recordRunFor(control, binDirectory, target);

		const result = await runPipelineCli(
			[
				"replay",
				"--run",
				recorded,
				"--stage",
				"shape",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"1",
				"--confirm",
				"--yes",
				"--reps",
				"2",
				"--json",
			],
			control,
			binDirectory,
		);

		temporaryDirectories.push(...preservedEvidenceIn(result.stderr));

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe(
			await Bun.file(reportBesideGroupIn(result.stderr)).text(),
		);
	});
});

/**
 * What each declared command does when invoked with no argument and no flag,
 * against a non-TTY stdin. `run` and `replay` are the two that could reach a
 * provider, and each is held to the exact refusal that stops it: a weaker
 * assertion, one that accepts 0, would go on passing the day a change lets
 * `run` proceed and start a paid session from the suite.
 *
 * `run` refused on a missing --model until cases declared their own; the
 * declaration answered that flag and left this invocation reaching the paid
 * path, which is the regression the spend-authorization gate now stops. The
 * refusal changed; what it guards did not.
 */
const BARE_REFUSALS: ReadonlyMap<string, { code: number; reason: string }> =
	new Map([
		[
			"run",
			{
				code: EXIT_CODES.refusedPrecondition,
				reason: "nothing you passed authorizes the spend",
			},
		],
		["replay", { code: EXIT_CODES.usageError, reason: "Provide --run" }],
		["review", { code: EXIT_CODES.usageError, reason: "Provide the run" }],
		["calibrate", { code: EXIT_CODES.usageError, reason: "Provide the run" }],
		[
			"compare",
			{
				code: EXIT_CODES.usageError,
				reason: "Provide the comparison manifest",
			},
		],
		["list", { code: EXIT_CODES.usageError, reason: "is not one of" }],
		["show", { code: EXIT_CODES.usageError, reason: "Provide the record id" }],
		[
			"regrade",
			{
				code: EXIT_CODES.usageError,
				reason: "Provide the attempt to regrade",
			},
		],
		["stale", { code: EXIT_CODES.completed, reason: "" }],
		["case list", { code: EXIT_CODES.completed, reason: "" }],
		[
			"case show",
			{ code: EXIT_CODES.usageError, reason: "Provide the case id" },
		],
		[
			"case capture",
			{ code: EXIT_CODES.usageError, reason: "Provide the case id" },
		],
	]);

describe("every declared command", () => {
	/**
	 * Adding an entry to COMMANDS without a dispatch case fails only at runtime,
	 * where typecheck, lint, and the suite all stay green. Invoking each declared
	 * name is the guard, and asserting the exact code and reason is what keeps
	 * the guard from passing on a command that started doing something else.
	 */
	it.each(COMMANDS.map((command) => command.name))(
		"refuses rehearse %s with no argument, exactly as declared",
		async (name) => {
			const expected = BARE_REFUSALS.get(name);

			const result = await runCli(name.split(" "));

			expect(expected).toBeDefined();
			expect(result.stderr).not.toContain("declared but not wired up");
			expect(result.exitCode).toBe(expected?.code ?? -1);
			expect(result.stderr).toContain(expected?.reason ?? "");
		},
	);
});

describe("a paying command given every session knob", () => {
	/**
	 * What actually stands between the suite and a paid session once the usage
	 * errors above are satisfied: `run --pause` refuses because the pause needs
	 * a TTY, and `replay` refuses because no recorded run answers `--run`.
	 * Naming the refusal each makes is what fails loudly if a change ever lets
	 * one of them proceed to a provider call from a test.
	 */
	it.each([
		{
			name: "run",
			args: ["--pause", "--target", "/nonexistent-target"],
			reason: "stdin is not a terminal",
		},
		{
			name: "replay",
			args: ["--run", "absent", "--stage", "build"],
			reason: "No replayable run named absent",
		},
	])(
		"refuses $name before any provider call",
		async ({ name, args, reason }) => {
			const result = await runCli([
				name,
				...args,
				"--model",
				"sonnet",
				"--session-budget-usd",
				"1",
			]);

			expect(result.exitCode).toBe(EXIT_CODES.refusedPrecondition);
			expect(result.stderr).toContain(reason);
			expect(result.stdout).toBe("");
		},
	);
});

describe("reading the records", () => {
	/**
	 * The one listing a fresh checkout can answer, because `cases/` is committed
	 * and `.benchmark-runs` is git-ignored. Every other kind is observed over a
	 * fixture the test builds, so the suite is green on any machine rather than
	 * only on one whose runs directory happens to hold the records.
	 */
	it("prints one line per declared case, ids show accepts back", async () => {
		const result = await runCli(["list", "cases"]);

		expect(result.exitCode).toBe(0);
		const printed = result.stdout.trimEnd().split("\n");
		expect(printed.map((line) => line.split("\t")[0])).toContain("case:smoke");
		for (const line of printed) {
			expect(line.startsWith("case:")).toBe(true);
		}
	});

	it("shows a case list prints, exactly as the declaration on disk", async () => {
		const listed = await runCli(["list", "cases"]);
		const id = listed.stdout.split("\t")[0] ?? "";

		const result = await runCli(["show", id, "--json"]);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(() => {
			JSON.parse(result.stdout);
		}).not.toThrow();
	});

	it("refuses an unknown list kind with a usage exit code and no stdout", async () => {
		const result = await runCli(["list", "bogus"]);

		expect(result.exitCode).toBe(2);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("comparisons");
	});

	it("refuses show with no argument by naming the id forms", async () => {
		const result = await runCli(["show"]);

		expect(result.exitCode).toBe(2);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("checkpoint:<run>/<stage>");
	});

	it("refuses an id whose prefix names no record kind", async () => {
		const result = await runCli(["show", "nonsense"]);

		expect(result.exitCode).toBe(2);
		expect(result.stdout).toBe("");
	});

	it("refuses a malformed body by naming the form its prefix takes", async () => {
		const result = await runCli(["show", "checkpoint:only-one-part"]);

		expect(result.exitCode).toBe(2);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("checkpoint:<run>/<stage>");
	});

	it("refuses a well-formed id naming no record as a precondition", async () => {
		const result = await runCli(["show", "run:absent"]);

		expect(result.exitCode).toBe(3);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("run:absent");
	});

	it("refuses a corpus source that does not resolve as a precondition", async () => {
		const result = await runCli([
			"stale",
			"--corpus",
			"/nonexistent-corpus-probe",
		]);

		expect(result.exitCode).toBe(3);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("/nonexistent-corpus-probe");
	});
});
