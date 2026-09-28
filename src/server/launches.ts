import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { LaunchRecord } from "#benchmark/launch-record";
import {
	launchAttemptsSchema,
	writeLaunchRecord,
} from "#benchmark/launch-record";
import { readCaseDeclaration } from "#benchmark/case";
import { loadRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths, launchPaths } from "#benchmark/run-layout";

/** Starts the CLI with these arguments and answers with the child's pid. */
export interface Launcher {
	readonly launch: (
		argv: readonly string[],
		logFile: string,
	) => Promise<number>;
}

export interface LaunchDependencies {
	readonly runsDirectory: string;
	readonly casesRoot: string;
	readonly launcher: Launcher;
}

const launchRequestSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("case"),
			caseId: z.string(),
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

type LaunchRequest = z.infer<typeof launchRequestSchema>;

/**
 * A browser click approves the spend the dialog stated, so a group is started
 * already approved: the child has no terminal to ask on.
 */
function confirmationArguments(attempts: number): readonly string[] {
	return attempts === 1
		? []
		: ["--confirm", "--reps", String(attempts), "--yes"];
}

/**
 * The argv is built from the declaration and the run's manifest, never from
 * the request's own strings beyond the ids those were read by.
 */
async function launchArguments(
	request: LaunchRequest,
	dependencies: LaunchDependencies,
): Promise<readonly string[]> {
	if (request.kind === "case") {
		const declaration = await readCaseDeclaration(
			request.caseId,
			dependencies.casesRoot,
		);

		return [
			"run",
			"--case",
			declaration.id,
			"--model",
			declaration.model ?? "",
			...confirmationArguments(request.attempts),
		];
	}

	const manifest = await loadRunManifest(
		benchmarkRunPaths(dependencies.runsDirectory, request.run).manifestFile,
	);

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

function launchRecord(
	request: LaunchRequest,
	id: string,
	pid: number,
): LaunchRecord {
	const common = {
		id,
		attempts: request.attempts,
		pid,
		launchedAt: new Date().toISOString(),
	};

	return request.kind === "case"
		? { ...common, kind: "case", caseId: request.caseId }
		: { ...common, kind: "replay", run: request.run, stage: request.stage };
}

// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types
export const createLaunchApp = (dependencies: LaunchDependencies) =>
	new Hono().post("/api/launches", async (context) => {
		const request = launchRequestSchema.parse(await context.req.json());
		const argv = await launchArguments(request, dependencies);
		const id = randomUUID();
		const pid = await dependencies.launcher.launch(
			argv,
			launchPaths(dependencies.runsDirectory, id).logFile,
		);
		await writeLaunchRecord(
			dependencies.runsDirectory,
			launchRecord(request, id, pid),
		);

		return context.json({ id }, 202);
	});

export type LaunchRoutes = ReturnType<typeof createLaunchApp>;
