import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { LaunchRecord } from "#benchmark/launch-record";
import {
	isLaunchId,
	launchAttemptsSchema,
	readLaunchRecord,
	writeLaunchRecord,
} from "#benchmark/launch-record";
import {
	CaseDeclarationError,
	caseDeclarationPath,
	isCaseId,
	listCases,
	readCaseDeclaration,
} from "#benchmark/case";
import { INITIAL_CHECKPOINT_STAGE } from "#benchmark/checkpoint";
import { loadRunManifest } from "#benchmark/manifest";
import {
	benchmarkRunPaths,
	checkpointRecorded,
	launchPaths,
	recordedRunNames,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { openRunEventStore } from "#benchmark/run-events";
import type { RunLiveness } from "#benchmark/run-liveness";
import { requestPause } from "#benchmark/run-pause";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import type { Settings } from "#benchmark/settings";
import { readSettings, SET_SPEND_CEILING_COMMAND } from "#benchmark/settings";
import { redactAbsolutePaths } from "./redact-path";
import { runStatus } from "./run-status";

/**
 * Starts the CLI with these arguments and answers with the child's pid, and
 * says when the process holding a pid started, undefined when none does.
 */
export interface Launcher {
	readonly launch: (
		argv: readonly string[],
		logFile: string,
	) => Promise<number>;
	readonly startedAt: (pid: number) => Promise<string | undefined>;
	readonly stop: (pid: number) => void;
}

export interface LaunchDependencies {
	readonly runsDirectory: string;
	readonly casesRoot: string;
	readonly launcher: Launcher;
	readonly liveness: RunLiveness;
}

/**
 * Why a launch was not started: a request the dialog never sends is 400, a
 * case, run or stage that is not recorded is 404, and one that is recorded but
 * cannot be started as it stands is 409.
 */
class LaunchRefusalError extends Error {
	public override name = "LaunchRefusalError";

	public constructor(
		message: string,
		public readonly status: 400 | 404 | 409,
	) {
		super(message);
	}
}

const launchRequestSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("case"),
			caseId: z.string().refine(isCaseId, "is not a case id"),
			attempts: launchAttemptsSchema,
		})
		.strict(),
	z
		.object({
			kind: z.literal("replay"),
			run: z.string(),
			stage: z.string(),
			attempts: launchAttemptsSchema,
		})
		.strict(),
]);

export type LaunchRequest = z.infer<typeof launchRequestSchema>;

/**
 * A browser click approves the spend the dialog stated, so a group is started
 * already approved: the child has no terminal to ask on.
 */
function confirmationArguments(attempts: number): readonly string[] {
	return attempts === 1
		? []
		: [
				"--confirm",
				"--reps",
				String(attempts),
				"--yes",
				"--approved-in-browser",
			];
}

function caseRecorded(caseId: string, casesRoot: string): Promise<boolean> {
	return isCaseId(caseId)
		? Bun.file(caseDeclarationPath(caseId, casesRoot)).exists()
		: Promise.resolve(false);
}

async function caseArguments(
	caseId: string,
	attempts: number,
	casesRoot: string,
): Promise<readonly string[]> {
	if (!(await caseRecorded(caseId, casesRoot))) {
		throw new LaunchRefusalError(`Unknown case ${caseId}`, 404);
	}

	let declaration;
	try {
		declaration = await readCaseDeclaration(caseId, casesRoot);
	} catch (error) {
		if (!(error instanceof CaseDeclarationError)) {
			throw error;
		}
		throw new LaunchRefusalError(redactAbsolutePaths(error.message), 409);
	}
	if (declaration.model === undefined) {
		throw new LaunchRefusalError(
			`Case ${caseId} declares no model, and a launch from the browser has no terminal to pick one on. Declare "model" in its case.json.`,
			409,
		);
	}

	return [
		"run",
		"--case",
		declaration.id,
		"--model",
		declaration.model,
		...confirmationArguments(attempts),
	];
}

/**
 * A replay of a stage consumes the checkpoint the stage before it recorded,
 * or the initial checkpoint for the first stage, so that one must be on disk.
 */
async function replayArguments(
	request: Readonly<{ run: string; stage: string; attempts: number }>,
	runsDirectory: string,
): Promise<readonly string[]> {
	const runs = await recordedRunNames(runsDirectory);
	if (!runs.includes(request.run)) {
		throw new LaunchRefusalError(`No recorded run ${request.run}`, 404);
	}
	const paths = benchmarkRunPaths(runsDirectory, request.run);
	let manifest;
	try {
		manifest = await loadRunManifest(paths.manifestFile);
	} catch (error) {
		throw new LaunchRefusalError(
			`Run ${request.run} has a manifest that cannot be read: ${redactAbsolutePaths(error instanceof Error ? error.message : String(error))}`,
			409,
		);
	}
	const stages = manifest.pipeline.stages.map(({ name }) => name);
	const index = stages.indexOf(request.stage);
	if (index === -1) {
		throw new LaunchRefusalError(
			`Run ${request.run} has no ${request.stage} stage; it declares ${stages.join(", ")}`,
			404,
		);
	}
	const consumed = stages[index - 1] ?? INITIAL_CHECKPOINT_STAGE;
	if (!(await checkpointRecorded(paths, consumed))) {
		throw new LaunchRefusalError(
			`Run ${request.run} recorded no ${consumed} checkpoint, which replaying ${request.stage} starts from`,
			409,
		);
	}

	return [
		"replay",
		"--run",
		request.run,
		"--stage",
		request.stage,
		"--model",
		manifest.model,
		...confirmationArguments(request.attempts),
	];
}

/** An unreadable settings file refuses the launch the way no ceiling does. */
async function storedSettings(runsDirectory: string): Promise<Settings> {
	try {
		return await readSettings(runsDirectory);
	} catch (error) {
		if (!(error instanceof RefusedPreconditionError)) {
			throw error;
		}
		throw new LaunchRefusalError(redactAbsolutePaths(error.message), 409);
	}
}

/**
 * The argv is built from the declaration and the run's manifest, and from
 * request strings only once they name a recorded case, run and stage.
 */
async function launchArguments(
	request: LaunchRequest,
	dependencies: LaunchDependencies,
): Promise<readonly string[]> {
	const { spendCeilingUsd } = await storedSettings(dependencies.runsDirectory);
	if (spendCeilingUsd === undefined) {
		throw new LaunchRefusalError(
			`No spend ceiling is stored, and nothing spends without one. Set it with: ${SET_SPEND_CEILING_COMMAND}`,
			409,
		);
	}

	return request.kind === "case"
		? caseArguments(request.caseId, request.attempts, dependencies.casesRoot)
		: replayArguments(request, dependencies.runsDirectory);
}

function launchRecord(
	request: LaunchRequest,
	id: string,
	process: { readonly pid: number; readonly startedAt: string | undefined },
): LaunchRecord {
	const common = {
		id,
		attempts: request.attempts,
		pid: process.pid,
		startedAt: process.startedAt,
		launchedAt: new Date().toISOString(),
	};

	return request.kind === "case"
		? { ...common, kind: "case", caseId: request.caseId }
		: { ...common, kind: "replay", run: request.run, stage: request.stage };
}

/**
 * The launch a stop names, once its process is still the one the launch
 * started: a pid alone could name a later process the system gave it to.
 */
async function runningLaunch(
	id: string,
	dependencies: LaunchDependencies,
): Promise<LaunchRecord> {
	if (
		!isLaunchId(id) ||
		!(await Bun.file(
			launchPaths(dependencies.runsDirectory, id).recordFile,
		).exists())
	) {
		throw new LaunchRefusalError(`Unknown launch ${id}`, 404);
	}

	const record = await readLaunchRecord(dependencies.runsDirectory, id);
	if (record.startedAt === undefined) {
		throw new LaunchRefusalError(
			`Launch ${id} was recorded without its process start time, so its pid cannot be told from another process's. Stop it from a terminal.`,
			409,
		);
	}
	if (
		(await dependencies.launcher.startedAt(record.pid)) !== record.startedAt
	) {
		throw new LaunchRefusalError(`Launch ${id} is no longer running`, 409);
	}

	return record;
}

/**
 * Asks a recorded pipeline run to pause after its current stage, refusing one
 * whose history row does not read RUNNING: a finished run has no next stage
 * to hold back, and a request left beside it would pause nothing.
 */
async function pauseRun(
	run: string,
	dependencies: LaunchDependencies,
): Promise<void> {
	const runs = await recordedRunNames(dependencies.runsDirectory);
	if (!runs.includes(run)) {
		throw new LaunchRefusalError(`No recorded run ${run}`, 404);
	}
	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(dependencies.runsDirectory),
	);
	let status;
	try {
		status = await runStatus(
			dependencies.runsDirectory,
			run,
			runEvents,
			dependencies.liveness,
		);
	} finally {
		runEvents.close();
	}
	if (status !== "RUNNING") {
		throw new LaunchRefusalError(`Run ${run} is not running`, 409);
	}

	await requestPause(
		benchmarkRunPaths(dependencies.runsDirectory, run),
		new Date().toISOString(),
	);
}

/**
 * Chained from `new Hono()` for the RPC type, as `createApiApp` explains.
 */
// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types
export const createLaunchApp = (dependencies: LaunchDependencies) => {
	const app = new Hono()
		.get("/api/settings", async (context) => {
			let settings;
			try {
				settings = await storedSettings(dependencies.runsDirectory);
			} catch (error) {
				if (!(error instanceof LaunchRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}

			return context.json(
				{
					spendCeilingUsd: settings.spendCeilingUsd ?? null,
					setCommand: SET_SPEND_CEILING_COMMAND,
				},
				200,
			);
		})
		.get("/api/cases", async (context) => {
			const listing = await listCases(dependencies.casesRoot);

			return context.json({
				cases: listing.declarations.map((declaration) => ({
					id: declaration.id,
					kind: declaration.kind,
					title: declaration.title,
					model: declaration.model ?? null,
				})),
				unreadable: listing.unreadable.map(({ id, reason }) => ({
					id,
					reason: redactAbsolutePaths(reason),
				})),
			});
		})
		.post("/api/launches", async (context) => {
			const parsed = launchRequestSchema.safeParse(
				await context.req.json().catch(() => undefined),
			);
			if (!parsed.success) {
				return context.json({ error: z.prettifyError(parsed.error) }, 400);
			}
			const request = parsed.data;
			let argv;
			try {
				argv = await launchArguments(request, dependencies);
			} catch (error) {
				if (!(error instanceof LaunchRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}
			const id = randomUUID();
			const pid = await dependencies.launcher.launch(
				argv,
				launchPaths(dependencies.runsDirectory, id).logFile,
			);
			const startedAt = await dependencies.launcher.startedAt(pid);
			await writeLaunchRecord(
				dependencies.runsDirectory,
				launchRecord(request, id, { pid, startedAt }),
			);

			return context.json({ id }, 202);
		})
		.post("/api/launches/:id/stop", async (context) => {
			let record;
			try {
				record = await runningLaunch(context.req.param("id"), dependencies);
			} catch (error) {
				if (!(error instanceof LaunchRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}
			await writeLaunchRecord(dependencies.runsDirectory, {
				...record,
				stopRequestedAt: new Date().toISOString(),
			});
			dependencies.launcher.stop(record.pid);

			return context.json({ id: record.id }, 202);
		})
		.post("/api/runs/:run/pause", async (context) => {
			const run = context.req.param("run");
			try {
				await pauseRun(run, dependencies);
			} catch (error) {
				if (!(error instanceof LaunchRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}

			return context.json({ run }, 202);
		});

	/** The launch routes' net: an unanticipated failure reaches the browser redacted. */
	app.onError((caughtError, context) => {
		const message =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		return context.json({ error: redactAbsolutePaths(message) }, 500);
	});

	return app;
};

export type LaunchRoutes = ReturnType<typeof createLaunchApp>;
