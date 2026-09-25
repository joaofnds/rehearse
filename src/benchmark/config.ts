import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { benchmarkRunsDirectory } from "./run-layout";

export const CONTROL_DIR = resolve(import.meta.dir, "../..");
export const REQUIRED_BUN_VERSION = "1.4.0";
export const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
export const CLAUDE_TIMEOUT_MS = 30 * 60 * 1000;
export const MAX_STAGE_TURNS = 20;
export const HARNESS_RUBRIC_IDS = ["check-integrity", "local-checks"] as const;
export const MAX_CONTEXT_FILE_BYTES = 256 * 1024;
export const MAX_CONTEXT_TOTAL_BYTES = 1024 * 1024;

/**
 * The grade letters live here rather than in contracts because contracts
 * imports config, and config imports nothing of this project but run-layout.
 * Contracts re-derives its schema from this list, so the letters have one
 * definition.
 */
export const STAGE_LETTER_GRADES = ["A", "B", "C", "D", "F"] as const;

export type StageLetterGrade = (typeof STAGE_LETTER_GRADES)[number];

export const DEFAULT_MINIMUM_STAGE_GRADE: StageLetterGrade = "B";

/**
 * How a path is named to a reader. Sessions paste this output onto cards that
 * other people read, and an absolute path under the control root discloses the
 * home directory for nothing: the control-relative path names the same file
 * and is the one a reader can act on. A path outside the control root is left
 * as it is, because relative to a root it is not under says less than the path
 * itself.
 */
export function displayPath(path: string): string {
	const controlRelative = relative(CONTROL_DIR, path);

	return controlRelative.startsWith("..") || isAbsolute(controlRelative)
		? path
		: controlRelative;
}

/**
 * The resolver reads this variable, the test preload sets it, and the CLI
 * tests pass it to spawned children, so all three name it through this
 * constant. It must not start with BENCHMARK_, because the CLI tests strip
 * those variables from every child.
 */
export const RECORDS_DIRECTORY_VARIABLE = "REHEARSE_RECORDS_DIR";

/**
 * Where every command reads and writes its records. The test preload points
 * the variable at a temporary directory, which is what keeps a test run out of
 * the operator's records.
 */
export function recordsDirectory(
	env: Readonly<Record<string, string | undefined>> = Bun.env,
): string {
	const override = env[RECORDS_DIRECTORY_VARIABLE];

	if (override === "") {
		throw new Error(
			`${RECORDS_DIRECTORY_VARIABLE} is empty; unset it to keep records under .benchmark-runs`,
		);
	}

	return override === undefined
		? benchmarkRunsDirectory(CONTROL_DIR)
		: resolve(override);
}

export const DEFAULT_CASE_ID = "audit-log";

/**
 * Every record written before cases were declared ran the case that now lives
 * at cases/audit-log, so a record on disk without a caseId means exactly that
 * case. Removing this default would make those records unreadable.
 */
export const LEGACY_CASE_ID = DEFAULT_CASE_ID;

const MODEL_FAMILIES = ["opus", "sonnet", "haiku"] as const;
type ModelFamily = (typeof MODEL_FAMILIES)[number];

export const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

export type Effort = z.infer<typeof effortSchema>;
export type WorkflowStage = string;

interface SessionKnobs {
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly minimumStageGrade?: StageLetterGrade | undefined;
}

export interface ConfirmationConfig {
	readonly reps: number;
	readonly approved: boolean;
}

/**
 * The `--corpus` source string as the caller wrote it, resolved into a corpus
 * source before any provider call. Absent means the live install.
 */
interface CorpusSelection {
	readonly corpus?: string | undefined;
}

export interface BenchmarkConfig extends SessionKnobs, CorpusSelection {
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
export interface CaseDefaults {
	readonly caseId: string;
	readonly pipelinePath: string;
	readonly targetPath: string;
	readonly model?: string | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

interface ParsedFlags {
	readonly values: ReadonlyMap<string, string>;
	readonly switches: ReadonlySet<string>;
}

function modelFamily(model: string): ModelFamily | undefined {
	const normalized = model.toLowerCase();
	const alias = MODEL_FAMILIES.find((family) => normalized === family);
	if (alias !== undefined) {
		return alias;
	}

	const terms = normalized.split(/[^a-z0-9]+/u);
	if (!terms.includes("claude")) {
		return undefined;
	}

	return MODEL_FAMILIES.find((family) => terms.includes(family));
}

function defaultJudgeModel(workflowModel: string): string {
	return modelFamily(workflowModel) === "opus" ? "sonnet" : "opus";
}

export function judgeSelfPreferenceWarning(config: {
	readonly model: string;
	readonly judgeModel: string;
}): string | undefined {
	if (config.model === config.judgeModel) {
		return `Self-preference warning: Judge and workflow both use model ${config.model}; grades may favor the workflow output.`;
	}

	const workflowFamily = modelFamily(config.model);
	if (
		workflowFamily === undefined ||
		workflowFamily !== modelFamily(config.judgeModel)
	) {
		return undefined;
	}

	return `Self-preference warning: Judge model ${config.judgeModel} and workflow model ${config.model} are both in the ${workflowFamily} family; grades may favor the workflow output.`;
}

const SWITCH_FLAGS = new Set(["--confirm", "--yes", "--pause"]);

function flagValues(args: readonly string[]): ParsedFlags {
	const values = new Map<string, string>();
	const switches = new Set<string>();

	for (let index = 0; index < args.length;) {
		const key = args[index];
		if (key === undefined || !key.startsWith("--")) {
			throw new Error(
				`Invalid argument sequence near ${key ?? "end of input"}`,
			);
		}
		if (SWITCH_FLAGS.has(key)) {
			switches.add(key);
			index += 1;
			continue;
		}

		const value = args[index + 1];
		if (value === undefined || value === "") {
			throw new Error(`Invalid argument sequence near ${key}`);
		}

		values.set(key, value);
		index += 2;
	}

	return { values, switches };
}

function parseConfirmation(flags: ParsedFlags): ConfirmationConfig | undefined {
	const confirmation = flags.switches.has("--confirm");
	const approved = flags.switches.has("--yes");
	const repsText = flags.values.get("--reps");

	if (!confirmation) {
		if (repsText !== undefined || approved) {
			throw new Error("Use --reps and --yes only with --confirm");
		}

		return undefined;
	}

	const reps = repsText === undefined ? 5 : Number(repsText);
	if (!Number.isInteger(reps) || reps < 2) {
		throw new Error("Confirmation reps must be an integer of at least 2");
	}

	return { reps, approved };
}

function withConfirmation<Config extends object>(
	config: Config,
	confirmation: ConfirmationConfig | undefined,
): Config & { readonly confirmation?: ConfirmationConfig | undefined } {
	if (confirmation === undefined) {
		return config;
	}

	return { ...config, confirmation };
}

/**
 * The key is omitted rather than set to undefined: exact optional property
 * types make those different shapes, and a record built from this configuration
 * must not carry a corpus key naming nothing.
 */
function withCorpus<Config extends object>(
	config: Config,
	corpus: string | undefined,
): Config & CorpusSelection {
	if (corpus === undefined) {
		return config;
	}

	return { ...config, corpus };
}

function parseMinimumStageGrade(text: string | undefined): StageLetterGrade {
	if (text === undefined || text === "") {
		return DEFAULT_MINIMUM_STAGE_GRADE;
	}

	const upper = text.toUpperCase();
	const grade = STAGE_LETTER_GRADES.find((letter) => letter === upper);
	if (grade === undefined) {
		throw new Error(
			`Minimum grade must be one of ${STAGE_LETTER_GRADES.join(", ")}`,
		);
	}

	return grade;
}

interface DeclaredSessionKnobs {
	readonly model?: string | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

function parseSessionKnobs(
	values: ReadonlyMap<string, string>,
	env: Readonly<Record<string, string | undefined>>,
	declared: DeclaredSessionKnobs = {},
): SessionKnobs {
	const modelText = values.get("--model") ?? env["BENCHMARK_MODEL"];
	const model =
		modelText === undefined || modelText === "" ? declared.model : modelText;
	const budgetText =
		values.get("--session-budget-usd") ?? env["BENCHMARK_SESSION_BUDGET_USD"];
	const sessionBudgetUsd =
		budgetText === undefined || budgetText === ""
			? declared.sessionBudgetUsd
			: Number(budgetText);

	if (model === undefined || sessionBudgetUsd === undefined) {
		const missing = [
			model === undefined ? "--model or BENCHMARK_MODEL" : undefined,
			sessionBudgetUsd === undefined
				? "--session-budget-usd or BENCHMARK_SESSION_BUDGET_USD"
				: undefined,
		].filter((flag) => flag !== undefined);

		throw new Error(`Provide ${missing.join(" and ")}`);
	}
	if (!Number.isFinite(sessionBudgetUsd) || sessionBudgetUsd <= 0) {
		throw new Error("Session budget must be a positive number");
	}

	const judgeModel =
		values.get("--judge-model") ??
		env["BENCHMARK_JUDGE_MODEL"] ??
		defaultJudgeModel(model);
	const effort = parseEffort(
		values.get("--effort") ?? env["BENCHMARK_EFFORT"],
		"workflow",
	);
	const judgeEffort = parseEffort(
		values.get("--judge-effort") ?? env["BENCHMARK_JUDGE_EFFORT"] ?? effort,
		"Judge",
	);

	const minimumStageGrade = parseMinimumStageGrade(
		values.get("--minimum-grade") ?? env["BENCHMARK_MINIMUM_GRADE"],
	);

	return {
		model,
		effort,
		judgeModel,
		judgeEffort,
		sessionBudgetUsd,
		minimumStageGrade,
	};
}

/**
 * Which case a run selects, read before anything else: the case declares the
 * pipeline and the fallback target, so it has to be loaded before the rest of
 * the configuration can be resolved.
 */
export function parseCaseId(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>> = Bun.env,
): string {
	const { values } = flagValues(args);

	return values.get("--case") ?? env["BENCHMARK_CASE"] ?? DEFAULT_CASE_ID;
}

export function parseArgs(
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

	return withConfirmation(
		withCorpus(
			{
				caseId: caseDefaults.caseId,
				sourceDir: resolve(sourceDir),
				pause: flags.switches.has("--pause"),
				...sessionKnobs,
				pipelinePath: controlRelativePath(
					values.get("--pipeline") ??
						env["BENCHMARK_PIPELINE"] ??
						caseDefaults.pipelinePath,
				),
			},
			values.get("--corpus"),
		),
		confirmation,
	);
}

export interface SessionRunConfig extends SessionKnobs, CorpusSelection {
	readonly caseId: string;
	readonly confirmation?: ConfirmationConfig | undefined;
}

const PIPELINE_ONLY_FLAGS = ["--target", "--pipeline"] as const;

export interface SessionCaseDefaults extends DeclaredSessionKnobs {
	readonly caseId: string;
}

/**
 * A session case declares neither a target repository nor a pipeline, so it
 * gets its own parser rather than a BenchmarkConfig with those fields defaulted
 * to a lie. Naming one of them on a session case is a usage error, not a flag
 * that quietly does nothing.
 */
export function parseSessionArgs(
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

export interface ReplayCliConfig extends SessionKnobs, CorpusSelection {
	readonly runName: string;
	readonly stage: string;
	readonly confirmation?: ConfirmationConfig | undefined;
}

/**
 * Read before the rest of replay's configuration: the run manifest names the
 * case being replayed, and that case's declared model and budget are what
 * the rest of the parse falls back to.
 */
export function parseRunName(args: readonly string[]): string {
	const { values } = flagValues(args);
	const runName = values.get("--run");

	if (runName === undefined || runName === "") {
		throw new Error("Provide --run with the run's name");
	}

	return runName;
}

/**
 * Whether replay would ask for a cost approval, read without the run's case
 * declaration: a projected cost is refused before any local or provider work
 * when nothing can answer it, so the refusal must not wait on resolving the
 * run first.
 */
export function parseReplayConfirmation(
	args: readonly string[],
): ConfirmationConfig | undefined {
	return parseConfirmation(flagValues(args));
}

/**
 * Replay shares the run's model, effort, judge, and budget knobs and their
 * environment fallbacks, plus the model and budget the replayed run's case
 * declares, at the same precedence `run` gives them; what it adds is naming
 * the recorded run and the stage to replay from it.
 */
export function parseReplayArgs(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>> = Bun.env,
	declared: DeclaredSessionKnobs = {},
): ReplayCliConfig {
	const flags = flagValues(args);
	const { values } = flags;

	const runName = parseRunName(args);
	const stage = values.get("--stage");

	if (stage === undefined || stage === "") {
		throw new Error("Provide --stage with the stage to replay");
	}

	const sessionKnobs = parseSessionKnobs(values, env, declared);
	const confirmation = parseConfirmation(flags);

	return withConfirmation(
		withCorpus(
			{
				runName,
				stage,
				...sessionKnobs,
			},
			values.get("--corpus"),
		),
		confirmation,
	);
}

export interface StaleCliConfig extends CorpusSelection {
	readonly model?: string | undefined;
	readonly effort?: Effort | undefined;
}

/**
 * `stale` reads the model and effort a replay would use, with the same flags
 * and environment fallbacks `run` and `replay` read them by, because those are
 * what a recorded checkpoint is compared against. Unlike those two it requires
 * neither: it pays for nothing, so a knob it was not given asserts nothing
 * rather than refusing the command.
 */
export function parseStaleArgs(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>> = Bun.env,
): StaleCliConfig {
	const { values } = flagValues(args);
	const named = values.get("--model") ?? env["BENCHMARK_MODEL"];
	const effort = parseEffort(
		values.get("--effort") ?? env["BENCHMARK_EFFORT"],
		"workflow",
	);
	const corpus = withCorpus({}, values.get("--corpus"));
	const withModel =
		named === undefined || named === "" ? corpus : { ...corpus, model: named };

	return effort === undefined ? withModel : { ...withModel, effort };
}

/**
 * A run artifact records the pipeline path so two runs can be compared, which
 * only works when the same pipeline yields the same string on every machine.
 * An absolute path and a path through ".." both name a file that a plain
 * relative path names too, so the path is reduced to that one form here, at the
 * boundary, rather than left for every later reader to normalise.
 */
function controlRelativePath(pipelinePath: string): string {
	return relative(CONTROL_DIR, resolve(CONTROL_DIR, pipelinePath));
}

function parseEffort(
	value: string | undefined,
	role: string,
): Effort | undefined {
	if (value === undefined) {
		return undefined;
	}

	const parsed = effortSchema.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`Unsupported effort for ${role}: ${value}. Use low, medium, high, xhigh, or max`,
		);
	}

	return parsed.data;
}
