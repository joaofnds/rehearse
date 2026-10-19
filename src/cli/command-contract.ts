interface FlagDefinition {
	readonly name: string;
	readonly kind: "value" | "switch";
	readonly envVar?: string | undefined;
	readonly defaultValue?: string | undefined;
	readonly help: string;
}

/**
 * Whether a command's process runs inside the sandbox that keeps its sessions
 * from signalling the operator's other processes: always, never, or as the
 * case it runs decides, for `run`, whose session cases may hold no tool.
 */
type Confinement = "always" | "never" | "by case";

interface CommandDefinition {
	readonly name: string;
	readonly summary: string;
	readonly confinement: Confinement;
	readonly argument?: string | undefined;
	readonly flags: readonly FlagDefinition[];
}

interface CommandLine {
	readonly helpRequested: boolean;
	readonly argument: string | undefined;
	readonly json: boolean;
	readonly flags: readonly string[];
}
interface CommandInvocation {
	readonly commandLine: CommandLine;
	readonly runsDirectory: string;
}
interface CommandEntry {
	readonly definition: CommandDefinition;
	readonly execute: (invocation: CommandInvocation) => Promise<number>;
}
export type {
	CommandDefinition,
	CommandEntry,
	CommandInvocation,
	CommandLine,
	Confinement,
	FlagDefinition,
};
