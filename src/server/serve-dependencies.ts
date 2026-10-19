import { homedir } from "node:os";
import { join } from "node:path";

import { casesRoot } from "#benchmark/case";
import { CONTROL_DIR, RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { liveCorpusSource } from "#benchmark/corpus-file";
import { linkedCorpusSource } from "#benchmark/corpus-source";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import type { AppServerDependencies } from "#server/app";
import processLauncher from "#server/process-launcher";
import type { ServerReadings } from "#server/serve-startup";

interface ServingContext extends ServerReadings {
	readonly port: number;
	readonly runsDirectory: string;
}

function serverDependencies(
	readings: Readonly<ServingContext>,
): AppServerDependencies {
	const { runsDirectory, port } = readings;
	return {
		casesRoot: casesRoot(),
		clientDistDirectory: join(CONTROL_DIR, "client", "dist"),
		home: homedir(),
		launcher: processLauncher(
			[process.execPath, join(CONTROL_DIR, "rehearse.ts")],
			{ ...Bun.env, [RECORDS_DIRECTORY_VARIABLE]: runsDirectory },
		),
		liveCorpus: () => liveCorpusSource(),
		liveness: readings.liveness,
		now: () => new Date(),
		port,
		projectsDirectory: claudeProjectsDirectory(),
		readCorpusSource: async () => await linkedCorpusSource(runsDirectory),
		recordParseCache: readings.recordParseCache,
		runsDirectory,
	};
}

export { serverDependencies as default };
