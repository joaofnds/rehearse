import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GradedStageRef } from "#benchmark/operator-grade";
import {
	NO_PROVIDER_PROJECTS,
	RecordedRunsFixture,
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import createApiApp from "#server/api";

import createCalibrationApp from "./calibration";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function recordsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-calibration-"));
	roots.push(root);

	return join(root, ".benchmark-runs");
}

/** Every file under the records directory with its sha256, so a test sees any byte a request changed. */
async function fileDigests(
	runsDirectory: string,
): Promise<Readonly<Record<string, string>>> {
	const files = await readdir(runsDirectory, {
		recursive: true,
		withFileTypes: true,
	});
	const digests: Record<string, string> = {};
	await Array.fromAsync(
		files.filter((entry) => entry.isFile()),
		async (file) => {
			const path = join(file.parentPath, file.name);
			digests[path] = createHash("sha256")
				.update(await readFile(path))
				.digest("hex");
		},
	);

	return digests;
}

function appFor(
	runsDirectory: string,
): ReturnType<typeof createCalibrationApp> {
	return createCalibrationApp({ runsDirectory });
}

/** Posts the request body as written, so a test can send one no client would build. */
async function postGrade(
	runsDirectory: string,
	path: string,
	body: string,
): Promise<Response> {
	return await Promise.resolve(
		appFor(runsDirectory).request(`${path}/grade`, {
			body,
			headers: { "content-type": "application/json" },
			method: "POST",
		}),
	);
}

async function clearCalibrationRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

class CalibrationEvidence {
	public readonly runsDirectory: string;
	public readonly gradeRefs: readonly GradedStageRef[];
	private readonly api: ReturnType<typeof createApiApp>;
	private readonly paths: readonly string[];

	public constructor(fixture: RecordedRunsFixture) {
		this.runsDirectory = fixture.runsDirectory;
		this.api = createApiApp({
			liveness: nothingRunning,
			projectsDirectory: NO_PROVIDER_PROJECTS,
			readCorpusSource: fixedCorpusSource(
				directorySource(fixture.runsDirectory),
			),
			runsDirectory: fixture.runsDirectory,
		});
		this.paths = [
			"/api/runs",
			`/api/runs/${fixture.replayableRun}`,
			`/api/runs/${fixture.stoppedRun}`,
			`/api/runs/${fixture.replayableRun}/stages/discuss/judge`,
			`/api/runs/${fixture.stoppedRun}/stages/build/judge`,
		];
		this.gradeRefs = [
			{ kind: "run", run: fixture.stoppedRun, stage: "build" },
			{ kind: "run", run: fixture.replayableRun, stage: "discuss" },
			{
				groupId: fixture.groupId,
				kind: "rep",
				repId: "rep-1",
				stage: "discuss",
			},
			{ kind: "replay", ...fixture.stageAttempt },
		];
	}

	public static async create(): Promise<CalibrationEvidence> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-calibration-"));
		roots.push(root);
		const fixture = new RecordedRunsFixture(root);
		await fixture.write();
		await fixture.stopped.writeGradedStoppedRun();

		return new CalibrationEvidence(fixture);
	}

	public async responses(): Promise<readonly string[]> {
		return await Promise.all(
			this.paths.map(async (path) => {
				const response = await this.api.request(path);

				return `${response.status} ${await response.text()}`;
			}),
		);
	}
}

export {
	CalibrationEvidence,
	roots,
	recordsDirectory,
	fileDigests,
	appFor,
	postGrade,
	clearCalibrationRoots,
};
