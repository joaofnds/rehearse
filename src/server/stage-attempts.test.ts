import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	directorySource,
	fixedCorpusSource,
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

/** What the list shows of an attempt's grade and staleness. */
interface AttemptReading {
	readonly grade: string | undefined;
	readonly stale: boolean | readonly string[];
}

function attemptReading(attempt: StageAttempt): AttemptReading {
	return {
		grade: attempt.kind === "original" ? "run record" : attempt.grade,
		stale:
			attempt.staleness.state === "available"
				? attempt.staleness.stale
				: attempt.staleness.reasons,
	};
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
		expect(attempts.attempts.map(attemptReading)).toEqual([
			{ grade: "run record", stale: true },
			{ grade: "A", stale: true },
			{
				grade: "A",
				stale: ["the group froze no pipeline to hash its stages against"],
			},
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

	it("answers over the API, and 404 for a stage the run's pipeline does not hold", async () => {
		const fixture = await fixtureWithReplayAndRep();
		const api = createApiApp({
			projectsDirectory: NO_PROVIDER_PROJECTS,
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const found = await api.request(
			`/api/runs/${fixture.replayableRun}/stages/build/attempts`,
		);
		const missing = await api.request(
			`/api/runs/${fixture.replayableRun}/stages/deploy/attempts`,
		);

		expect(found.status).toBe(200);
		expect(
			z.object({ checkpoint: z.string() }).parse(await found.json()),
		).toEqual({ checkpoint: "audit-log/r2/s1" });
		expect(missing.status).toBe(404);
	});
});
