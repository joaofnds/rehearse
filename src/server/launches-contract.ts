import type { Context, Env, HonoRequest } from "hono";
import type { z } from "zod";

import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import type { LaunchTarget } from "#benchmark/launch-record";
import type { RunLiveness } from "#benchmark/run-liveness";
import type CorpusEditGate from "#server/corpus-edit-gate";
import type createLaunchApp from "#server/launches";
import type { launchRequestSchema } from "#server/launches-launch-request-schema";

/**
 * Starts the CLI with these arguments and answers with the child's pid, and
 * says when the process holding a pid started, undefined when none does.
 */
interface Launcher {
	readonly launch: (
		argv: readonly string[],
		logFile: string,
	) => Promise<number>;
	readonly startedAt: (pid: number) => Promise<string | undefined>;
	readonly stop: (pid: number) => void;
}

interface LaunchDependencies {
	readonly now: () => Date;
	readonly runsDirectory: string;
	readonly casesRoot: string;
	readonly launcher: Launcher;
	readonly liveness: RunLiveness;
	/** The live install, which no instruction edit writes under. */
	readonly liveCorpus: () => LiveCorpusRoot;
	/** The operator's home, which a corpus path starting with `~/` names. */
	readonly home: string;
}

type LaunchRequest = z.infer<typeof launchRequestSchema>;

/** What setup asked to scan: the live install, or a directory to link. */
type SetupCorpusChoice =
	| { readonly kind: "live" }
	| { readonly kind: "directory"; readonly directory: string };

/** The CLI arguments a launch starts, and what its record says it runs. */
interface Launch {
	readonly argv: readonly string[];
	readonly target: LaunchTarget;
}

type LaunchRoutes = ReturnType<typeof createLaunchApp>;

interface LaunchContext<Path extends string> {
	readonly req: Readonly<Pick<HonoRequest<Path>, "param" | "json" | "text">>;
	readonly json: Context<Env>["json"];
}

interface LaunchEditDependencies {
	readonly dependencies: LaunchDependencies;
	readonly corpusEditGate: Readonly<CorpusEditGate>;
}

type LaunchJsonRequest = Readonly<Pick<HonoRequest, "json">>;

interface LaunchControlContext extends LaunchEditDependencies {
	readonly runsStartingAnalysis: Set<string>;
}

export type {
	LaunchControlContext,
	LaunchJsonRequest,
	LaunchContext,
	LaunchEditDependencies,
	Launcher,
	LaunchDependencies,
	LaunchRequest,
	SetupCorpusChoice,
	Launch,
	LaunchRoutes,
};
