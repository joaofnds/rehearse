import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	benchmarkRunPaths,
	benchmarkRunsDirectory,
	checkpointRecordFile,
	checkpointStageNames,
	comparisonDigests,
	confirmationGroupIds,
	confirmationGroupPaths,
	recordedRunNames,
	replayAttemptIds,
	runEventsDatabaseFile,
	runNameFromCheckpointsEntry,
	runNameFromTimestamp,
	runStageFiles,
	sessionAttemptIds,
	sessionAttemptPaths,
} from "./run-layout";

describe(runEventsDatabaseFile.name, () => {
	it("names one database file shared across every run under the runs directory", () => {
		const runsDirectory = benchmarkRunsDirectory("/control");

		expect(runEventsDatabaseFile(runsDirectory)).toBe(
			join("/control", ".benchmark-runs", "run-events.sqlite"),
		);
	});
});

describe(benchmarkRunPaths.name, () => {
	it("preserves every existing run artifact path", () => {
		const runsDirectory = benchmarkRunsDirectory("/control");
		const name = runNameFromTimestamp("2026-08-31T01:45:19.323Z");
		const paths = benchmarkRunPaths(runsDirectory, name);

		expect(paths).toMatchObject({
			runsDirectory: join("/control", ".benchmark-runs"),
			name: "2026-08-31T01-45-19.323Z",
			artifactFile: join(
				"/control",
				".benchmark-runs",
				"2026-08-31T01-45-19.323Z.json",
			),
			reviewFile: join(
				"/control",
				".benchmark-runs",
				"2026-08-31T01-45-19.323Z.review.json",
			),
			checkpointsDirectory: join(
				"/control",
				".benchmark-runs",
				"2026-08-31T01-45-19.323Z.checkpoints",
			),
			manifestFile: join(
				"/control",
				".benchmark-runs",
				"2026-08-31T01-45-19.323Z.checkpoints",
				"manifest.json",
			),
			replaysDirectory: join("/control", ".benchmark-runs", "replays"),
		});
		expect(paths.stageFile("shape")).toBe(
			join(
				"/control",
				".benchmark-runs",
				"2026-08-31T01-45-19.323Z.shape.json",
			),
		);
		expect(paths.checkpointDirectory("initial")).toBe(
			join(
				"/control",
				".benchmark-runs",
				"2026-08-31T01-45-19.323Z.checkpoints",
				"initial",
			),
		);
		expect(
			paths.replayRecordFile("lineage-1", "2026-08-31T04:22:25.607Z"),
		).toBe(
			join(
				"/control",
				".benchmark-runs",
				"replays",
				"lineage-1",
				"2026-08-31T04-22-25.607Z.json",
			),
		);
		expect(runNameFromCheckpointsEntry("run-1.checkpoints")).toBe("run-1");
		expect(runNameFromCheckpointsEntry("run-1.json")).toBeUndefined();
	});
});

describe(confirmationGroupPaths.name, () => {
	it("assigns one durable path to every group and rep artifact", () => {
		const paths = confirmationGroupPaths(
			benchmarkRunsDirectory("/control"),
			"group-1",
		);
		const rep = paths.rep("group-1-rep-2");

		expect(paths).toMatchObject({
			directory: join(
				"/control",
				".benchmark-runs",
				"confirmations",
				"group-1",
			),
			groupFile: join(
				"/control",
				".benchmark-runs",
				"confirmations",
				"group-1",
				"group.json",
			),
			inputsDirectory: join(
				"/control",
				".benchmark-runs",
				"confirmations",
				"group-1",
				"inputs",
			),
			reportFile: join(
				"/control",
				".benchmark-runs",
				"confirmations",
				"group-1",
				"report.json",
			),
			repsDirectory: join(
				"/control",
				".benchmark-runs",
				"confirmations",
				"group-1",
				"reps",
			),
		});
		expect(rep).toMatchObject({
			directory: join(paths.repsDirectory, "group-1-rep-2"),
			recordFile: join(paths.repsDirectory, "group-1-rep-2", "rep.json"),
			attemptFile: join(paths.repsDirectory, "group-1-rep-2", "attempt.json"),
			transcriptFile: join(
				paths.repsDirectory,
				"group-1-rep-2",
				"transcript.jsonl",
			),
			stagesDirectory: join(paths.repsDirectory, "group-1-rep-2", "stages"),
			checkpointsDirectory: join(
				paths.repsDirectory,
				"group-1-rep-2",
				"checkpoints",
			),
		});
		expect(rep.stageFile("build")).toBe(
			join(paths.repsDirectory, "group-1-rep-2", "stages", "build.json"),
		);
		expect(rep.checkpointDirectory("build")).toBe(
			join(paths.repsDirectory, "group-1-rep-2", "checkpoints", "build"),
		);
	});
});

describe(sessionAttemptPaths.name, () => {
	it("assigns one durable path to a session attempt's record and corpus", () => {
		const paths = sessionAttemptPaths(benchmarkRunsDirectory("/control"), {
			caseId: "smoke",
			uuid: "uuid-1",
		});

		expect(paths).toMatchObject({
			directory: join(
				"/control",
				".benchmark-runs",
				"sessions",
				"smoke",
				"uuid-1",
			),
			recordFile: join(
				"/control",
				".benchmark-runs",
				"sessions",
				"smoke",
				"uuid-1",
				"attempt.json",
			),
			transcriptFile: join(
				"/control",
				".benchmark-runs",
				"sessions",
				"smoke",
				"uuid-1",
				"transcript.jsonl",
			),
			corpusDirectory: join(
				"/control",
				".benchmark-runs",
				"sessions",
				"smoke",
				"uuid-1",
				"corpus",
			),
			gradesDirectory: join(
				"/control",
				".benchmark-runs",
				"sessions",
				"smoke",
				"uuid-1",
				"grades",
			),
		});
	});

	it("files each regrade under a timestamp inside the attempt it read", () => {
		const paths = sessionAttemptPaths(benchmarkRunsDirectory("/control"), {
			caseId: "smoke",
			uuid: "uuid-1",
		});

		expect(paths.gradeFile("2026-09-20T12:00:00.000Z")).toBe(
			join(paths.gradesDirectory, "2026-09-20T12-00-00.000Z.json"),
		);
	});
});

describe(checkpointRecordFile.name, () => {
	it("names the record file inside a checkpoint directory", () => {
		expect(checkpointRecordFile("/checkpoints/build")).toBe(
			join("/checkpoints", "build", "checkpoint.json"),
		);
	});
});

describe("recorded record enumeration", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function fixtureRoot(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-run-layout-"));
		roots.push(root);

		return root;
	}

	it("names every run that recorded a checkpoints directory", async () => {
		const root = await fixtureRoot();
		await mkdir(join(root, "run-b.checkpoints", "build"), { recursive: true });
		await mkdir(join(root, "run-a.checkpoints"), { recursive: true });
		await Bun.write(join(root, "run-a.json"), "{}\n");

		expect(await recordedRunNames(root)).toEqual(["run-a", "run-b"]);
	});

	it("names every confirmation group directory", async () => {
		const root = await fixtureRoot();
		await mkdir(join(root, "confirmations", "group-2"), { recursive: true });
		await mkdir(join(root, "confirmations", "group-1"), { recursive: true });

		expect(await confirmationGroupIds(root)).toEqual(["group-1", "group-2"]);
	});

	it("names every comparison report directory", async () => {
		const root = await fixtureRoot();
		await mkdir(join(root, "comparisons", "b".repeat(64)), { recursive: true });
		await mkdir(join(root, "comparisons", "a".repeat(64)), { recursive: true });

		expect(await comparisonDigests(root)).toEqual([
			"a".repeat(64),
			"b".repeat(64),
		]);
	});

	it("names every session attempt by its case and its uuid", async () => {
		const root = await fixtureRoot();
		await mkdir(join(root, "sessions", "smoke", "uuid-2"), { recursive: true });
		await mkdir(join(root, "sessions", "smoke", "uuid-1"), { recursive: true });
		await mkdir(join(root, "sessions", "audit-log", "uuid-3"), {
			recursive: true,
		});

		expect(await sessionAttemptIds(root)).toEqual([
			{ caseId: "audit-log", uuid: "uuid-3" },
			{ caseId: "smoke", uuid: "uuid-1" },
			{ caseId: "smoke", uuid: "uuid-2" },
		]);
	});

	it("names every stage replay by its lineage and its timestamp", async () => {
		const root = await fixtureRoot();
		await mkdir(join(root, "replays", "lineage-1"), { recursive: true });
		await Bun.write(
			join(root, "replays", "lineage-1", "2026-09-03T00-00-00.000Z.json"),
			"{}\n",
		);
		await Bun.write(join(root, "replays", "lineage-1", "notes.txt"), "x\n");

		expect(await replayAttemptIds(root)).toEqual([
			{ lineage: "lineage-1", timestamp: "2026-09-03T00-00-00.000Z" },
		]);
	});

	it("names every per-stage file a run wrote, artifact and review excluded", async () => {
		const root = await fixtureRoot();
		await Bun.write(join(root, "run-a.shape.json"), "{}\n");
		await Bun.write(join(root, "run-a.build.json"), "{}\n");
		await Bun.write(join(root, "run-a.json"), "{}\n");
		await Bun.write(join(root, "run-a.review.json"), "{}\n");
		await Bun.write(join(root, "run-ab.shape.json"), "{}\n");

		expect(await runStageFiles(root, "run-a")).toEqual([
			join(root, "run-a.build.json"),
			join(root, "run-a.shape.json"),
		]);
	});

	it("names every checkpoint stage a run recorded, sorted", async () => {
		const root = await fixtureRoot();
		await mkdir(join(root, "run-a.checkpoints", "build"), { recursive: true });
		await mkdir(join(root, "run-a.checkpoints", "initial"), {
			recursive: true,
		});

		expect(await checkpointStageNames(root, "run-a")).toEqual([
			"build",
			"initial",
		]);
	});

	it("reads a run with no checkpoints directory as no stages recorded", async () => {
		const root = await fixtureRoot();

		expect(await checkpointStageNames(root, "absent-run")).toEqual([]);
	});

	it.each([
		recordedRunNames,
		confirmationGroupIds,
		comparisonDigests,
		sessionAttemptIds,
		replayAttemptIds,
	])(
		"reads an absent runs directory as nothing recorded",
		async (enumerate) => {
			expect(await enumerate(join(await fixtureRoot(), "absent"))).toEqual([]);
		},
	);
});
