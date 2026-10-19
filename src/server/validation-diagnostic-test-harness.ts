import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import createAppServer from "#server/app";
import {
	FAKE_LAUNCH_TIME,
	FakeLauncher,
	directoryLiveCorpus,
} from "#server/launch-test-support";
import DiagnosticDriver from "#server/validation-diagnostic-test-driver";

const PORT = 4173;

class DiagnosticHarness {
	public readonly launcher: FakeLauncher;
	public readonly driver: DiagnosticDriver;

	private constructor(private readonly directory: string) {
		this.launcher = new FakeLauncher();
		const app = createAppServer({
			casesRoot: directory,
			clientDistDirectory: directory,
			home: directory,
			launcher: this.launcher,
			liveCorpus: () => directoryLiveCorpus(directory),
			liveness: nothingRunning,
			now: () => new Date(FAKE_LAUNCH_TIME),
			port: PORT,
			projectsDirectory: directory,
			readCorpusSource: fixedCorpusSource(directorySource(directory)),
			runsDirectory: directory,
		});

		this.driver = new DiagnosticDriver(app, PORT);
	}

	public static async setup(): Promise<DiagnosticHarness> {
		const directory = await mkdtemp(
			join(tmpdir(), "rehearse-invalid-request-"),
		);

		return new DiagnosticHarness(directory);
	}

	public async teardown(): Promise<void> {
		await rm(this.directory, { force: true, recursive: true });
	}
}

export { DiagnosticHarness as default };
