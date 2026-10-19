import { resolve } from "node:path";

import {
	flagValues,
	parseConfirmation,
	withConfirmation,
	withCorpus,
} from "./configuration-options";
import type {
	ConfirmationConfig,
	CorpusSelection,
} from "./configuration-options";
import { DEFAULT_CASE_ID, controlRelativePath } from "./runtime-configuration";
import { parseSessionKnobs } from "./session-knobs";
import type { DeclaredSessionKnobs, SessionKnobs } from "./session-knobs";

interface BenchmarkConfig extends SessionKnobs, CorpusSelection {
	readonly caseId: string;
	readonly sourceDir: string;
	readonly pipelinePath: string;
	readonly pause: boolean;
	readonly confirmation?: ConfirmationConfig | undefined;
}

/**
 * What the selected case contributes to a run's configuration: its own id, the
 * pipeline it declares, and the target repository it was written against.
 * `--target` and BENCHMARK_TARGET_DIR still win over the declared target.
 */
interface CaseDefaults {
	readonly caseId: string;
	readonly pipelinePath: string;
	readonly targetPath: string;
	readonly model?: string | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

/**
 * Which case a run selects, read before anything else: the case declares the
 * pipeline and the fallback target, so it has to be loaded before the rest of
 * the configuration can be resolved.
 */
function parseCaseId(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>> = Bun.env,
): string {
	const { values } = flagValues(args);

	return values.get("--case") ?? env["BENCHMARK_CASE"] ?? DEFAULT_CASE_ID;
}

function parseArgs(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
	caseDefaults: CaseDefaults,
): BenchmarkConfig {
	const flags = flagValues(args);
	const { values } = flags;

	const sourceDir =
		values.get("--target") ??
		env["BENCHMARK_TARGET_DIR"] ??
		caseDefaults.targetPath;

	if (sourceDir === "") {
		throw new Error("Provide --target or BENCHMARK_TARGET_DIR");
	}

	const sessionKnobs = parseSessionKnobs(values, env, caseDefaults);
	const confirmation = parseConfirmation(flags);

	const benchmarkConfig = {
		caseId: caseDefaults.caseId,
		pause: flags.switches.has("--pause"),
		sourceDir: resolve(sourceDir),
		...sessionKnobs,
		pipelinePath: controlRelativePath(
			values.get("--pipeline") ??
				env["BENCHMARK_PIPELINE"] ??
				caseDefaults.pipelinePath,
		),
	};

	return withConfirmation(
		withCorpus(benchmarkConfig, values.get("--corpus")),
		confirmation,
	);
}

interface SessionRunConfig extends SessionKnobs, CorpusSelection {
	readonly caseId: string;
	readonly confirmation?: ConfirmationConfig | undefined;
}

const PIPELINE_ONLY_FLAGS = ["--target", "--pipeline"] as const;

interface SessionCaseDefaults extends DeclaredSessionKnobs {
	readonly caseId: string;
}

/**
 * A session case declares neither a target repository nor a pipeline, so it
 * gets its own parser rather than a BenchmarkConfig with those fields defaulted
 * to a lie. Naming one of them on a session case is a usage error, not a flag
 * that quietly does nothing.
 */
function parseSessionArgs(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
	caseDefaults: SessionCaseDefaults,
): SessionRunConfig {
	const flags = flagValues(args);
	const refused = PIPELINE_ONLY_FLAGS.find((flag) => flags.values.has(flag));
	if (refused !== undefined) {
		throw new Error(
			`Case ${caseDefaults.caseId} is a session case and takes no ${refused}`,
		);
	}

	return withConfirmation(
		withCorpus(
			{
				caseId: caseDefaults.caseId,
				...parseSessionKnobs(flags.values, env, caseDefaults),
			},
			flags.values.get("--corpus"),
		),
		parseConfirmation(flags),
	);
}

export { parseCaseId, parseArgs, parseSessionArgs };
export type {
	BenchmarkConfig,
	CaseDefaults,
	SessionRunConfig,
	SessionCaseDefaults,
};
