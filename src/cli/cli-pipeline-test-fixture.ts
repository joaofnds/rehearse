import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { runCommand } from "#benchmark/command";
import { benchmarkRunsDirectory } from "#benchmark/run-layout";
import { storeSpendCeiling } from "#benchmark/settings";
import { PROJECT_ROOT } from "#benchmark/test-support";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

import { runPipelineCli } from "./cli-process-test-driver";
import { containerShim, providerShim } from "./cli-provider-test-fixture";

const FINAL_RECORDED_RESULT_OFFSET = -1;

const FREE_PROVIDER_CALL_COST_USD = 0;
const TEST_SPEND_CEILING_USD = 100;

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
	await declareStandInTarget(control);
	await commitFixtureRepository({
		directory: control,
		message: "chore: control copy",
	});

	return control;
}

/**
 * The copied audit-log case runs its checks against `passingTarget`, which
 * needs none of the database and cache the real target's tests reach, so the
 * copy declares no services.
 */
async function declareStandInTarget(control: string): Promise<void> {
	const pipelineFile = Bun.file(
		join(control, "cases", "audit-log", "pipelines", "default.json"),
	);
	const pipeline = z
		.looseObject({ target: z.record(z.string(), z.unknown()) })
		.parse(await pipelineFile.json());
	const target = Object.fromEntries(
		Object.entries(pipeline.target).filter(([field]) => field !== "services"),
	);
	await Bun.write(pipelineFile, `${JSON.stringify({ ...pipeline, target })}\n`);
}

/** Puts back the services `declareStandInTarget` removed, for a run whose `docker` is a stand-in. */
async function restoreDeclaredServices(control: string): Promise<void> {
	const pipeline = join("cases", "audit-log", "pipelines", "default.json");
	await Bun.write(
		join(control, pipeline),
		Bun.file(join(PROJECT_ROOT, pipeline)),
	);
	await runCommand(
		["git", "commit", "-qam", "chore: declare the case's services"],
		control,
	);
}

/**
 * A target whose declared checks all succeed, so the run reaches its stages
 * instead of refusing at the baseline. audit-log's setup and checks name these
 * scripts; what they do is beside the point for a stream contract.
 */
async function passingTarget(
	directory: string,
	scripts: Readonly<Record<string, string>> = {},
): Promise<string> {
	const target = join(directory, "target");
	await mkdir(target, { recursive: true });
	await Bun.write(
		join(target, "package.json"),
		`${JSON.stringify(
			{
				name: "stdout-contract-target",
				scripts: {
					check: "true",
					migrate: "true",
					"test:unit": "true",
					typecheck: "true",
					...scripts,
				},
			},
			null,
			RECORD_JSON_INDENT_SPACES,
		)}\n`,
	);
	await Bun.write(join(target, "tsconfig.json"), "{}\n");
	await Bun.write(join(target, "biome.json"), "{}\n");
	await commitFixtureRepository({ directory: target, message: "chore: base" });

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
	const name = recorded.at(FINAL_RECORDED_RESULT_OFFSET);
	if (name === undefined) {
		throw new Error(`No recorded run under ${runsDirectory}`);
	}

	return name;
}

interface PipelineSpend {
	readonly ceilingUsd: number;
	readonly callCostUsd: number;
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

async function pipelineFixture(
	directory: string,
	spend?: PipelineSpend,
): Promise<PipelineFixture> {
	const callCostUsd = spend?.callCostUsd ?? FREE_PROVIDER_CALL_COST_USD;
	const ceilingUsd = spend?.ceilingUsd ?? TEST_SPEND_CEILING_USD;
	const [control, binDirectory, target] = await Promise.all([
		controlCopy(directory),
		providerShim({ callCostUsd, directory }),
		passingTarget(directory),
	]);
	await containerShim(binDirectory);
	await storeSpendCeiling(benchmarkRunsDirectory(control), ceilingUsd);

	return { binDirectory, control, target };
}

async function commitFixtureRepository({
	directory,
	message,
}: {
	readonly directory: string;
	readonly message: string;
}): Promise<void> {
	await runCommand(["git", "init", "-b", "main"], directory);
	await runCommand(["git", "config", "user.email", "t@example.com"], directory);
	await runCommand(
		["git", "config", "user.name", "Stdout Contract"],
		directory,
	);
	await runCommand(["git", "add", "-A"], directory);
	await runCommand(["git", "commit", "-m", message], directory);
}

export {
	controlCopy,
	FREE_PROVIDER_CALL_COST_USD,
	TEST_SPEND_CEILING_USD,
	passingTarget,
	pipelineFixture,
	recordRunFor,
	restoreDeclaredServices,
};
export type { PipelineFixture };
