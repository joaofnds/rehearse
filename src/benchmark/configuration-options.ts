const OPTION_AND_VALUE_ARGUMENT_COUNT = 2;

const OPTION_VALUE_OFFSET = 1;

const ARGUMENT_CURSOR_STEP = 1;

const DEFAULT_CONFIRMATION_REPS = 5;

const MIN_CONFIRMATION_REPS = 2;

/**
 * How a confirmation group's projected cost was approved: at the terminal's
 * prompt, by `--yes`, or by the Start click in the browser's launch dialog,
 * which starts the CLI with `--yes --approved-in-browser`.
 */
const APPROVAL_METHODS = ["interactive", "yes", "browser"] as const;

type ApprovalMethod = (typeof APPROVAL_METHODS)[number];

interface ConfirmationConfig {
	readonly reps: number;
	readonly approval: ApprovalMethod;
}

/**
 * The `--corpus` source string as the caller wrote it, resolved into a corpus
 * source before any provider call. Absent means the live install.
 */
interface CorpusSelection {
	readonly corpus?: string | undefined;
}

interface ParsedFlags {
	readonly values: ReadonlyMap<string, string>;
	readonly switches: ReadonlySet<string>;
}

const SWITCH_FLAGS = new Set([
	"--confirm",
	"--yes",
	"--approved-in-browser",
	"--pause",
	"--without-stage-skill",
]);

function flagName(text: string | undefined): string {
	if (text === undefined || !text.startsWith("--")) {
		throw new Error(`Invalid argument sequence near ${text ?? "end of input"}`);
	}

	return text;
}

interface FlagValue {
	readonly key: string;
	readonly value: string | undefined;
}

function flagValue({ key, value }: FlagValue): string {
	if (value === undefined || value === "") {
		throw new Error(`Invalid argument sequence near ${key}`);
	}

	return value;
}

function flagValues(args: readonly string[]): ParsedFlags {
	const values = new Map<string, string>();
	const switches = new Set<string>();

	for (let index = 0; index < args.length;) {
		const key = flagName(args[index]);
		if (SWITCH_FLAGS.has(key)) {
			switches.add(key);
			index += ARGUMENT_CURSOR_STEP;
		} else {
			values.set(
				key,
				flagValue({ key, value: args[index + OPTION_VALUE_OFFSET] }),
			);
			index += OPTION_AND_VALUE_ARGUMENT_COUNT;
		}
	}

	return { switches, values };
}

function approvalMethod(approved: boolean, inBrowser: boolean): ApprovalMethod {
	if (!approved) {
		return "interactive";
	}

	return inBrowser ? "browser" : "yes";
}

function confirmationReps(text: string | undefined): number {
	const reps = text === undefined ? DEFAULT_CONFIRMATION_REPS : Number(text);
	if (!Number.isInteger(reps) || reps < MIN_CONFIRMATION_REPS) {
		throw new Error("Confirmation reps must be an integer of at least 2");
	}

	return reps;
}

function parseConfirmation(flags: ParsedFlags): ConfirmationConfig | undefined {
	const approved = flags.switches.has("--yes");
	const inBrowser = flags.switches.has("--approved-in-browser");
	if (inBrowser && !approved) {
		throw new Error("Use --approved-in-browser only with --yes");
	}

	if (!flags.switches.has("--confirm")) {
		if (flags.values.has("--reps") || approved) {
			throw new Error("Use --reps and --yes only with --confirm");
		}

		return undefined;
	}

	return {
		approval: approvalMethod(approved, inBrowser),
		reps: confirmationReps(flags.values.get("--reps")),
	};
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

export {
	APPROVAL_METHODS,
	flagValues,
	parseConfirmation,
	withConfirmation,
	withCorpus,
};
export type {
	ApprovalMethod,
	ConfirmationConfig,
	CorpusSelection,
	ParsedFlags,
};
