import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { PROJECT_ROOT } from "#benchmark/test-support";
import { CONFINED_VARIABLE } from "#cli/confinement";

const UNREPORTED_EXIT_CODE = -1;

const CLI_TEST_TIMEOUT_MS = 20_000;

interface CliResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * The session knobs read an environment fallback, so a `BENCHMARK_MODEL` set on
 * the machine running the suite would change which refusal a command makes.
 * The child gets an environment with none of them, nor the marker of a
 * confined process, so every assertion below is about the code rather than
 * about this shell.
 */
function environmentWithoutKnobs(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(Bun.env)
			.filter(
				([name]) =>
					!name.startsWith("BENCHMARK_") && name !== CONFINED_VARIABLE,
			)
			.map(([name, value]) => [name, value ?? ""]),
	);
}

async function runCli(
	args: readonly string[],
	stdin: "inherit" | "empty" = "empty",
	env: Readonly<Record<string, string>> = environmentWithoutKnobs(),
): Promise<CliResult> {
	const child = Bun.spawn([process.execPath, "rehearse.ts", ...args], {
		cwd: PROJECT_ROOT,
		env,
		stderr: "pipe",
		stdin: stdin === "empty" ? new Blob([""]) : "inherit",
		stdout: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return { exitCode, stderr, stdout };
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
		stderr: "pipe",
		stdin: new Blob([""]),
		stdout: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return { exitCode, stderr, stdout };
}

async function runPackageScript(args: readonly string[]): Promise<CliResult> {
	const child = Bun.spawn([process.execPath, "run", "rehearse", ...args], {
		cwd: PROJECT_ROOT,
		env: environmentWithoutKnobs(),
		stderr: "pipe",
		stdin: new Blob([""]),
		stdout: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return { exitCode, stderr, stdout };
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
			stderr: "pipe",
			stdin: new Blob([""]),
			stdout: "pipe",
		},
	);
	const [stdout] = await Promise.all([
		new Response(child.stdout).text(),
		child.exited,
	]);

	return stdout;
}

export {
	CLI_TEST_TIMEOUT_MS,
	environmentWithoutKnobs,
	environmentWithoutRecordsLocation,
	runCli,
	runCliThroughPipe,
	runPackageScript,
	runPipelineCli,
	UNREPORTED_EXIT_CODE,
};
export type { CliResult };
