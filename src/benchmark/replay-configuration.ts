import {
	flagValues,
	parseConfirmation,
	withConfirmation,
	withCorpus,
} from "./configuration-options";
import type {
	ConfirmationConfig,
	CorpusSelection,
	ParsedFlags,
} from "./configuration-options";
import type { Effort } from "./effort";
import { parseEffort, parseSessionKnobs } from "./session-knobs";
import type { DeclaredSessionKnobs, SessionKnobs } from "./session-knobs";

/** Whether a stage replay installs the stage's own skill in its corpus. */
type StageSkillPresence = "installed" | "absent";

interface ReplayCliConfig extends SessionKnobs, CorpusSelection {
	readonly runName: string;
	readonly stage: string;
	readonly confirmation?: ConfirmationConfig | undefined;
	readonly stageSkill: StageSkillPresence;
}

/**
 * A comparison's baseline arm replays the stage without its own skill, and
 * only a confirmation group can be an arm.
 */
function parseStageSkill(
	flags: ParsedFlags,
	confirmation: ConfirmationConfig | undefined,
): StageSkillPresence {
	if (!flags.switches.has("--without-stage-skill")) {
		return "installed";
	}
	if (confirmation === undefined) {
		throw new Error("Use --without-stage-skill only with --confirm");
	}

	return "absent";
}

/**
 * Read before the rest of replay's configuration: the run manifest names the
 * case being replayed, and that case's declared model and budget are what
 * the rest of the parse falls back to.
 */
function parseRunName(args: readonly string[]): string {
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
function parseReplayConfirmation(
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
function parseReplayArgs(
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
				stageSkill: parseStageSkill(flags, confirmation),
			},
			values.get("--corpus"),
		),
		confirmation,
	);
}

interface StaleCliConfig extends CorpusSelection {
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
function parseStaleArgs(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>> = Bun.env,
): StaleCliConfig {
	const { values } = flagValues(args);
	const named = values.get("--model") ?? env["BENCHMARK_MODEL"];
	const effort = parseEffort({
		role: "workflow",
		value: values.get("--effort") ?? env["BENCHMARK_EFFORT"],
	});
	const corpus = withCorpus({}, values.get("--corpus"));
	const withModel =
		named === undefined || named === "" ? corpus : { ...corpus, model: named };

	return effort === undefined ? withModel : { ...withModel, effort };
}

export {
	parseRunName,
	parseReplayConfirmation,
	parseReplayArgs,
	parseStaleArgs,
};
export type { StageSkillPresence, ReplayCliConfig, StaleCliConfig };
