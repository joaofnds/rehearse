import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	directorySource,
	fixedCorpusSource,
	liveStageSettings,
	NO_PROVIDER_PROJECTS,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { claimShortId } from "#benchmark/short-id";
import { createApiApp } from "./api";
import { SessionHistoryReaderError } from "./session-history-reader";
import type { StageAttempt } from "./stage-attempts";
import { readStageAttempts } from "./stage-attempts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

async function corpusDirectory(): Promise<string> {
	const root = await temporaryRoot("rehearse-stage-attempts-corpus-");
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await mkdir(join(root, "skills", "discuss"), { recursive: true });
	await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");
	await Bun.write(join(root, "skills", "build", "SKILL.md"), "build skill\n");
	await Bun.write(
		join(root, "skills", "discuss", "SKILL.md"),
		"discuss skill\n",
	);

	return root;
}

/**
 * The fixture's audit-log records claimed, with a stage-mode group at the
 * replayable run's build stage beside the replay already there.
 */
async function fixtureWithReplayAndRep(): Promise<RecordedRunsFixture> {
	const fixture = new RecordedRunsFixture(
		await temporaryRoot("rehearse-stage-attempts-"),
	);
	await fixture.write();
	await fixture.claim("audit-log", fixture.auditLogClaims);
	await fixture.writeStageGroupWithReps("group-at-build");
	await claimShortId(fixture.runsDirectory, "audit-log", {
		kind: "group",
		groupId: "group-at-build",
		source: { run: fixture.replayableRun, stage: "build" },
	});

	return fixture;
}

/** What the list shows of an attempt's staleness. */
function staleReading(attempt: StageAttempt): boolean | readonly string[] {
	return attempt.staleness.state === "available"
		? attempt.staleness.stale
		: attempt.staleness.reasons;
}

/** The grade an attempt's own record carries; the original's is the run record's. */
function recordedGrade(attempt: StageAttempt): string | undefined {
	return "grade" in attempt ? attempt.grade : undefined;
}

describe(readStageAttempts.name, () => {
	it("lists the original run, a replay and a judged rep at the checkpoint a stage started from, in claim order", async () => {
		const fixture = await fixtureWithReplayAndRep();

		const attempts = await readStageAttempts({
			runsDirectory: fixture.runsDirectory,
			run: fixture.replayableRun,
			stage: "build",
			source: directorySource(await corpusDirectory()),
		});

		expect(attempts.checkpoint).toBe("audit-log/r2/s1");
		expect(attempts.attempts.map(({ kind, id }) => ({ kind, id }))).toEqual([
			{ kind: "original", id: "audit-log/r2" },
			{ kind: "replay", id: "audit-log/r3" },
			{ kind: "rep", id: "audit-log/g5 rep 1" },
		]);
		expect(attempts.attempts.map(recordedGrade)).toEqual([undefined, "A", "A"]);
		expect(attempts.attempts.map(staleReading)).toEqual([
			true,
			true,
			["the group froze no pipeline to hash its stages against"],
		]);
	});

	it("names the initial checkpoint for the first stage and lists the original alone when nothing else ran from it", async () => {
		const fixture = await fixtureWithReplayAndRep();

		const attempts = await readStageAttempts({
			runsDirectory: fixture.runsDirectory,
			run: fixture.replayableRun,
			stage: "discuss",
			source: directorySource(await corpusDirectory()),
		});

		expect(attempts.checkpoint).toBe("audit-log/r2/s0");
		expect(attempts.attempts.map(({ kind, id }) => ({ kind, id }))).toEqual([
			{ kind: "original", id: "audit-log/r2" },
		]);
	});

	it("judges the original attempt at a stage that stopped the run under the run's own id", async () => {
		const fixture = new RecordedRunsFixture(
			await temporaryRoot("rehearse-stage-attempts-"),
			{ settingsFile: await liveStageSettings() },
		);
		await fixture.writeGradedStoppedRun();
		const corpus = await corpusDirectory();
		await fixture.recordStoppedStageFrom(directorySource(corpus));
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

		const attempts = await readStageAttempts({
			runsDirectory: fixture.runsDirectory,
			run: fixture.stoppedRun,
			stage: "build",
			source: directorySource(corpus),
		});

		expect(attempts.attempts.map(({ kind }) => kind)).toEqual(["original"]);
		expect(attempts.attempts[0]?.staleness).toMatchObject({
			state: "available",
			stale: true,
			causes: ["skills/build/SKILL.md changed"],
		});
	});

	it("refuses a stage the run's pipeline does not hold", async () => {
		const fixture = await fixtureWithReplayAndRep();

		const attempts = readStageAttempts({
			runsDirectory: fixture.runsDirectory,
			run: fixture.replayableRun,
			stage: "deploy",
			source: directorySource(await corpusDirectory()),
		});

		expect(attempts).rejects.toThrow(SessionHistoryReaderError);
	});
});

describe("GET /api/runs/:run/stages/:stage/attempts", () => {
	async function attemptsApi(): Promise<{
		readonly api: ReturnType<typeof createApiApp>;
		readonly run: string;
	}> {
		const fixture = await fixtureWithReplayAndRep();

		return {
			api: createApiApp({
				projectsDirectory: NO_PROVIDER_PROJECTS,
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				readCorpusSource: fixedCorpusSource(
					directorySource(await corpusDirectory()),
				),
			}),
			run: fixture.replayableRun,
		};
	}

	it("answers the checkpoint a stage started from and its attempts", async () => {
		const { api, run } = await attemptsApi();

		const found = await api.request(`/api/runs/${run}/stages/build/attempts`);

		expect(found.status).toBe(200);
		expect(
			z.object({ checkpoint: z.string() }).parse(await found.json()),
		).toEqual({ checkpoint: "audit-log/r2/s1" });
	});

	it("answers 404 for a stage the run's pipeline does not hold", async () => {
		const { api, run } = await attemptsApi();

		const missing = await api.request(
			`/api/runs/${run}/stages/deploy/attempts`,
		);

		expect(missing.status).toBe(404);
	});
});
