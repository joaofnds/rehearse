import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTROL_DIR } from "#benchmark/config";
import {
	directorySource,
	liveStageSettings,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import type { RecordedRunsOptions } from "#benchmark/run-records-test-support";
import type { RunLiveness } from "#benchmark/run-liveness";
import { openRunEventStore } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import type { ContextLink, PipelineRunRow, RunHistoryRow } from "./run-history";
import { runHistoryReport } from "./run-history";

function pipelineRun(
	rows: readonly RunHistoryRow[],
	run: string,
): PipelineRunRow | undefined {
	return rows.find(
		(row): row is PipelineRunRow => row.kind === "run" && row.run === run,
	);
}

describe(runHistoryReport.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function corpusDirectory(buildSkill: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-run-history-corpus-"));
		roots.push(root);
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await mkdir(join(root, "skills", "discuss"), { recursive: true });
		await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(root, "skills", "build", "SKILL.md"), buildSkill);
		await Bun.write(
			join(root, "skills", "discuss", "SKILL.md"),
			"discuss skill\n",
		);

		return root;
	}

	async function writtenFixture(
		options: RecordedRunsOptions = {},
	): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-run-history-"));
		roots.push(root);
		const fixture = new RecordedRunsFixture(root, options);
		await fixture.write();

		return fixture;
	}

	/**
	 * A fixture whose records carry the live root settings digest. Every
	 * assertion about a row's `stale` flag needs it, because `deriveStaleness`
	 * compares the recorded digest against the one it loads from that file. The
	 * fixture's own literal never matches, so it would decide the flag on its
	 * own, passing a `stale: false` test for the wrong reason and passing a
	 * `stale: true` test whatever the corpus holds.
	 */
	async function fixtureRecordingLiveSettings(): Promise<RecordedRunsFixture> {
		return writtenFixture({ settingsFile: await liveStageSettings() });
	}

	it("names a run's status, stage, and corpus digest from its own recorded corpus files", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(corpus));

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(corpus),
			nothingRunning,
		);

		const row = pipelineRun(rows, fixture.replayableRun);
		expect(row).toMatchObject({
			run: fixture.replayableRun,
			caseId: "audit-log",
			status: "COMPLETE",
			stage: "build",
			grade: "B",
		});
		expect(row?.corpus?.digest).toMatch(/^[0-9a-f]{6}$/u);
	});

	it("changes a run's rendered corpus digest when one corpus byte changes", async () => {
		const fixture = await writtenFixture();
		const before = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(before));
		const { rows: beforeRows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(before),
			nothingRunning,
		);
		const beforeDigest = pipelineRun(beforeRows, fixture.replayableRun)?.corpus
			?.digest;

		const after = await corpusDirectory("build skill, edited\n");
		await fixture.recordCorpusFrom(directorySource(after));
		const { rows: afterRows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(after),
			nothingRunning,
		);
		const afterDigest = pipelineRun(afterRows, fixture.replayableRun)?.corpus
			?.digest;

		expect(afterDigest).not.toBe(beforeDigest);
	});

	it("marks a row stale when its latest checkpoint's corpus no longer matches", async () => {
		const fixture = await fixtureRecordingLiveSettings();
		const recorded = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(recorded));
		const edited = await corpusDirectory("build skill, edited\n");

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(edited),
			nothingRunning,
		);

		const row = pipelineRun(rows, fixture.replayableRun);
		expect(row?.stale).toBe(true);
		expect(row?.staleCauses.join(" ")).toContain("skills/build/SKILL.md");
	});

	describe("when a corpus directory holds a symlink out of the tree", () => {
		it("renders every row it could read rather than failing the report", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory("build skill\n");
			await fixture.recordCorpusFrom(directorySource(corpus));
			await symlink(
				join(corpus, "CLAUDE.md"),
				join(corpus, "skills", "build", "escape.md"),
			);

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(corpus),
				nothingRunning,
			);

			expect(pipelineRun(rows, fixture.replayableRun)).toBeDefined();
		});

		it("marks the row stale, naming the entry that could not be hashed", async () => {
			const fixture = await fixtureRecordingLiveSettings();
			const corpus = await corpusDirectory("build skill\n");
			await fixture.recordCorpusFrom(directorySource(corpus));
			await symlink(
				join(corpus, "CLAUDE.md"),
				join(corpus, "skills", "build", "escape.md"),
			);

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(corpus),
				nothingRunning,
			);

			const row = pipelineRun(rows, fixture.replayableRun);
			expect(row?.stale).toBe(true);
			expect(row?.staleCauses.join(" ")).toContain("skills/build/escape.md");
		});

		it("names no absolute filesystem path in the row's causes", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory("build skill\n");
			await fixture.recordCorpusFrom(directorySource(corpus));
			await symlink(
				join(corpus, "CLAUDE.md"),
				join(corpus, "skills", "build", "escape.md"),
			);

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(corpus),
				nothingRunning,
			);

			expect(
				rows
					.flatMap((row) => (row.kind === "run" ? row.staleCauses : []))
					.join(" "),
			).not.toContain(corpus);
		});
	});

	it("marks a row clean when its latest checkpoint's corpus still matches", async () => {
		const fixture = await fixtureRecordingLiveSettings();
		const corpus = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(corpus));

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(corpus),
			nothingRunning,
		);

		const row = pipelineRun(rows, fixture.replayableRun);
		expect(row?.stale).toBe(false);
		expect(row?.staleCauses).toEqual([]);
	});

	/**
	 * The two answers the pid probe can give, without a process to spawn. A
	 * live marker names a pid this test never checks for real: what the branch
	 * is being asked is whether it consults the probe at all, and a Fake is the
	 * only way to ask that deterministically.
	 */
	function liveness(alive: boolean): RunLiveness {
		return {
			readMarker: () => Promise.resolve({ pid: 4242 }),
			isAlive: () => alive,
		};
	}

	it("reports a run in flight as RUNNING, carrying the case its manifest names", async () => {
		const fixture = await writtenFixture();
		await fixture.writeRunningRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			liveness(true),
		);

		const row = pipelineRun(rows, fixture.runningRun);
		expect(row).toMatchObject({
			run: fixture.runningRun,
			caseId: "audit-log",
			status: "RUNNING",
		});
	});

	it("carries the executing stage, elapsed time, and scoped spend on a running row", async () => {
		const fixture = await writtenFixture();
		await fixture.writeRunningRun("turn-completed", "build", 0.9, 9000);

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			liveness(true),
		);

		const row = pipelineRun(rows, fixture.runningRun);
		expect(row?.progress).toMatchObject({
			state: "running",
			stage: "build",
			elapsedMs: 9000,
			spentUsd: 0.9,
			spendScope: "this stage's session so far",
		});
	});

	/**
	 * An event fires once per agent turn, which is minutes apart on a real run,
	 * so a row rendering the event's own elapsed figure would sit frozen between
	 * turns. The reading it was measured at travels with it, which is what lets
	 * a watcher carry it forward.
	 */
	it("dates a running run's elapsed reading so a watcher can carry it forward", async () => {
		const fixture = await writtenFixture();
		const before = Date.now();
		await fixture.writeRunningRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			liveness(true),
		);

		const row = pipelineRun(rows, fixture.runningRun);
		const measuredAt =
			row?.progress.state === "running"
				? Date.parse(row.progress.measuredAt)
				: Number.NaN;
		expect(measuredAt).toBeGreaterThanOrEqual(before);
		expect(measuredAt).toBeLessThanOrEqual(Date.now());
	});

	/**
	 * `spentUsd` means a different thing in each event kind, so the figure
	 * travels with the words describing what it covers. A reader that called
	 * every one of these "spent this run" would report a number that falls when
	 * a stage begins judging.
	 */
	it.each([
		["stage-started", "the stages finished before this one"],
		["turn-completed", "this stage's session so far"],
		["stage-judging", "this stage's session"],
		["stage-completed", "this stage's session and its judge"],
	] as const)(
		"describes a spend reading from a %s event as covering %s",
		async (kind, scope) => {
			const fixture = await writtenFixture();
			await fixture.writeRunningRun(kind, "build", 1.25, 4000);

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				liveness(true),
			);

			const row = pipelineRun(rows, fixture.runningRun);
			expect(row?.progress).toMatchObject({ spendScope: scope });
		},
	);

	it("marks a finished run's row as recorded rather than running", async () => {
		const fixture = await writtenFixture();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		const row = pipelineRun(rows, fixture.replayableRun);
		expect(row?.progress).toEqual({ state: "recorded" });
	});

	/**
	 * The target a crashed run claimed can be deleted or cease to be a git
	 * repository, and the marker read shells out to git, so the probe throws.
	 * That is still just "not running": before the running check existed such a
	 * run was simply absent from the report, and blaming git for it on every
	 * page load names the wrong thing and never stops.
	 */
	it("treats a run whose target cannot be reached as not running, not unreadable", async () => {
		const fixture = await writtenFixture();
		await fixture.writeRunningRun();

		const { rows, unreadable } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			{
				readMarker: () =>
					Promise.reject(
						new Error("ENOENT: no such file or directory, posix_spawn 'git'"),
					),
				isAlive: () => true,
			},
		);

		expect(pipelineRun(rows, fixture.runningRun)).toBeUndefined();
		expect(unreadable).toEqual([]);
	});

	it("does not report a run as running when the process that claimed its target is gone", async () => {
		const fixture = await writtenFixture();
		await fixture.writeRunningRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			liveness(false),
		);

		expect(pipelineRun(rows, fixture.runningRun)).toBeUndefined();
	});

	/**
	 * A target with no claim marker has no run on it: the run either finished
	 * and restored the target, or never claimed it. Reconciliation reads the
	 * same absence as "nothing to reconcile" and leaves the run alone, which is
	 * why this reader cannot borrow that answer.
	 */
	it("does not report a run as running when its target carries no claim marker", async () => {
		const fixture = await writtenFixture();
		await fixture.writeRunningRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			{ readMarker: () => Promise.resolve(undefined), isAlive: () => true },
		);

		expect(pipelineRun(rows, fixture.runningRun)).toBeUndefined();
	});

	it("does not report a finished run as running, whatever the target's marker says", async () => {
		const fixture = await writtenFixture();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			liveness(true),
		);

		expect(
			rows.map((row) => (row.kind === "group" ? undefined : row.status)),
		).not.toContain("RUNNING");
	});

	/**
	 * A target keeps its claim marker until the run restores it, and an
	 * interrupted run never got to. So a live marker sits beside an already
	 * terminal event stream, and only the event kind separates the two.
	 */
	it("keeps reporting an interrupted run as INTERRUPTED while its target's marker is still live", async () => {
		const fixture = await writtenFixture();
		await fixture.writeInterruptedRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			liveness(true),
		);

		const row = pipelineRun(rows, fixture.interruptedRun);
		expect(row).toMatchObject({ status: "INTERRUPTED" });
	});

	/**
	 * A signal abort records a terminal `run-failed` and writes no artifact, so
	 * nothing above the running check claims this run. Its target keeps the
	 * claim marker the aborted run never restored, which is a live pid beside a
	 * finished run: only the event kind tells them apart.
	 */
	it("does not report a signal-aborted run as running though its target's marker is still live", async () => {
		const fixture = await writtenFixture();
		await fixture.writeSignalAbortedRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			liveness(true),
		);

		expect(pipelineRun(rows, fixture.abortedRun)).toMatchObject({
			status: "FAILED",
			caseId: "audit-log",
			links: [
				{
					state: "unavailable",
					label: "build",
					reason: "failed before saving its context",
				},
			],
		});
	});

	it("reports a run stopped mid-stage with STOPPED:<stage> and no corpus digest when it recorded no checkpoint", async () => {
		const fixture = await writtenFixture();
		await fixture.writeStoppedRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		const row = pipelineRun(rows, fixture.stoppedRun);
		expect(row).toMatchObject({ status: "STOPPED:build" });
		expect(row?.corpus).toBeUndefined();
		expect(row?.stale).toBe(false);
		expect(row?.grade).toBeUndefined();
	});

	it("reports staleness from a stopped run's initial checkpoint", async () => {
		const fixture = await writtenFixture();
		await fixture.writeStoppedRun();
		await fixture.writeInitialCheckpoint(fixture.stoppedRun, {
			path: "stage-settings.json",
			sha256: "0".repeat(64),
		});

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		const row = pipelineRun(rows, fixture.stoppedRun);
		expect(row).toEqual({
			kind: "run",
			run: fixture.stoppedRun,
			caseId: "audit-log",
			status: "STOPPED:build",
			stage: undefined,
			grade: undefined,
			corpus: undefined,
			stale: true,
			staleCauses: ["stage settings file stage-settings.json changed"],
			progress: { state: "recorded" },
			links: [
				{
					state: "available",
					label: "build",
					href: `/runs/${fixture.stoppedRun}/stages/build`,
				},
			],
		});
	});

	it("reports a run reconciled to INTERRUPTED, which today's checkpoint- and stage-file reads alone leave invisible", async () => {
		const fixture = await writtenFixture();
		await fixture.writeInterruptedRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		const row = pipelineRun(rows, fixture.interruptedRun);
		expect(row).toMatchObject({ status: "INTERRUPTED" });
	});

	it("reports staleness from an interrupted run's initial checkpoint", async () => {
		const fixture = await writtenFixture();
		await fixture.writeInterruptedRun();
		await fixture.writeInitialCheckpoint(fixture.interruptedRun, {
			path: "stage-settings.json",
			sha256: "0".repeat(64),
		});

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		const row = pipelineRun(rows, fixture.interruptedRun);
		expect(row).toEqual({
			kind: "run",
			run: fixture.interruptedRun,
			caseId: "audit-log",
			status: "INTERRUPTED",
			stage: undefined,
			grade: undefined,
			corpus: undefined,
			stale: true,
			staleCauses: ["stage settings file stage-settings.json changed"],
			progress: { state: "recorded" },
			links: [],
		});
	});

	it("collects a run stopped mid-stage with no manifest as unreadable, matching list runs, rather than dropping it silently", async () => {
		const fixture = await writtenFixture();
		await fixture.writeStoppedRunWithoutManifest();

		const { rows, unreadable } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		expect(pipelineRun(rows, fixture.stoppedRun) !== undefined).toBe(false);
		expect(
			unreadable.some((entry) => entry.id === `run:${fixture.stoppedRun}`),
		).toBe(true);
	});

	/**
	 * The event table has no case column, so a run whose status comes from its
	 * events and whose manifest never got written is a row whose case is not
	 * recorded, rather than an entry that hides a run the operator started.
	 */
	it("lists a run reconciled to INTERRUPTED with no manifest as a row whose case is not recorded", async () => {
		const fixture = await writtenFixture();
		await fixture.writeInterruptedRunWithoutManifest();

		const { rows, unreadable } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		expect(pipelineRun(rows, fixture.interruptedRun)).toMatchObject({
			status: "INTERRUPTED",
			caseId: undefined,
		});
		expect(unreadable).toEqual([]);
	});

	it("lists a run known only from a run-failed event as a FAILED row whose case is not recorded", async () => {
		const fixture = await writtenFixture();
		await fixture.writeEventsOnlyFailedRun();

		const { rows } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		expect(pipelineRun(rows, fixture.eventsOnlyRun)).toMatchObject({
			status: "FAILED",
			caseId: undefined,
			links: [
				{
					state: "unavailable",
					label: "shape",
					reason: "failed before saving its context",
				},
			],
		});
	});

	it("names a run directory with no manifest and no events as unreadable, since nothing records what it ran", async () => {
		const fixture = await writtenFixture();
		await fixture.writeEmptyRunDirectory("any-name-1");

		const { rows, unreadable } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		expect(pipelineRun(rows, "any-name-1")).toBeUndefined();
		expect(unreadable).toContainEqual({
			id: "run:any-name-1",
			reason: "no manifest recorded",
		});
	});

	it("names a run with a manifest but no stage record and no events as unreadable, matching list runs' no record", async () => {
		const fixture = await writtenFixture();
		await fixture.writeNoRecordRun();

		const { rows, unreadable } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		expect(pipelineRun(rows, fixture.noRecordRun)).toBeUndefined();
		expect(unreadable).toContainEqual({
			id: `run:${fixture.noRecordRun}`,
			reason: "no record: no stage record and no run events",
		});
	});

	it("reads an empty runs directory as no rows, not an error", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-run-history-empty-"));
		roots.push(root);

		const { rows } = await runHistoryReport(
			root,
			directorySource(await corpusDirectory("build skill\n")),
			nothingRunning,
		);

		expect(rows).toEqual([]);
	});

	it("collects a run whose artifact fails to parse as unreadable, without dropping the other rows", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(corpus));
		await writeFile(
			join(fixture.runsDirectory, `${fixture.replayableRun}.json`),
			"{ not json\n",
		);

		const { rows, unreadable } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(corpus),
			nothingRunning,
		);

		expect(pipelineRun(rows, fixture.replayableRun) !== undefined).toBe(false);
		expect(pipelineRun(rows, fixture.unreplayableRun) !== undefined).toBe(true);
		expect(unreadable).toHaveLength(1);
		expect(unreadable.at(0)?.id).toBe(`run:${fixture.replayableRun}`);
		expect(unreadable.at(0)?.reason.length).toBeGreaterThan(0);
	});

	it("names no absolute filesystem path in an unreadable run's reason", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(corpus));
		await writeFile(
			join(fixture.runsDirectory, `${fixture.replayableRun}.json`),
			"{ not json\n",
		);

		const { unreadable } = await runHistoryReport(
			fixture.runsDirectory,
			directorySource(corpus),
			nothingRunning,
		);

		const reason = unreadable.at(0)?.reason ?? "";
		expect(reason).not.toContain(CONTROL_DIR);
		expect(reason).not.toMatch(/\/(?<segment>Users|home|var|tmp)\//u);
	});
	describe("when the runs directory holds a standalone session attempt", () => {
		it("lists it as a row naming its case, uuid, and the page that opens its context", async () => {
			const fixture = await writtenFixture();
			const { caseId, uuid } = fixture.sessionAttempt;

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(rows.find((row) => row.kind === "session-attempt")).toMatchObject({
				caseId,
				uuid,
				status: "SUCCESSFUL",
				links: [
					{
						state: "available",
						label: "context",
						href: `/attempts/session/${caseId}/${uuid}`,
					},
				],
			});
		});

		it("names an attempt directory with no record as unreadable by its record id", async () => {
			const fixture = await writtenFixture();
			const uuid = "0f6b6f2a-0000-4000-8000-000000000002";
			await fixture.writeEmptyAttemptDirectory("smoke", uuid);

			const { rows, unreadable } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(
				rows.some((row) => row.kind === "session-attempt" && row.uuid === uuid),
			).toBe(false);
			expect(unreadable).toContainEqual({
				id: `attempt:session:smoke/${uuid}`,
				reason: "incomplete: no attempt.json recorded",
			});
		});
	});

	describe("when the runs directory holds a stage replay", () => {
		it("lists it as a row naming its source run's case, its stage grade, and the page that opens its context", async () => {
			const fixture = await writtenFixture();
			const { lineage, timestamp } = fixture.stageAttempt;

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(rows.find((row) => row.kind === "replay")).toMatchObject({
				lineage,
				timestamp,
				caseId: "audit-log",
				stage: "build",
				grade: "A",
				status: "CONTINUE",
				links: [
					{
						state: "available",
						label: "context",
						href: `/replays/${lineage}/${timestamp}`,
					},
				],
			});
		});

		it("names its context unavailable when it is filed under a lineage it did not consume", async () => {
			const fixture = await writtenFixture();
			const { timestamp } = fixture.stageAttempt;
			await Bun.write(
				join(
					fixture.runsDirectory,
					"replays",
					"lineage-other",
					`${timestamp}.json`,
				),
				await Bun.file(fixture.stageAttemptFile).text(),
			);

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(
				rows.find(
					(row) => row.kind === "replay" && row.lineage === "lineage-other",
				),
			).toMatchObject({
				links: [
					{
						state: "unavailable",
						label: "context",
						reason: "filed under a lineage it did not consume",
					},
				],
			});
		});
	});

	describe("when the runs directory holds confirmation groups", () => {
		it("lists a session group as one row linking each rep that recorded an attempt", async () => {
			const fixture = await writtenFixture();
			const [recorded, missing] = await fixture.writeSessionGroup("group-s");

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(
				rows.find((row) => row.kind === "group" && row.groupId === "group-s"),
			).toEqual({
				kind: "group",
				groupId: "group-s",
				caseId: fixture.sessionAttempt.caseId,
				mode: "session",
				reps: 2,
				links: [
					{
						state: "available",
						label: "rep 1",
						href: `/groups/group-s/reps/${recorded}/attempt`,
					},
					{
						state: "unavailable",
						label: "rep 2",
						reason: `no attempt recorded for ${missing}`,
					},
				],
			});
		});

		it("names every rep of a stage group unavailable, since only a session rep has a context page", async () => {
			const fixture = await writtenFixture();

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(
				rows.find(
					(row) => row.kind === "group" && row.groupId === fixture.groupId,
				),
			).toMatchObject({
				mode: "stage",
				links: [
					{
						state: "unavailable",
						label: "rep 1",
						reason: "a stage group has no session context",
					},
					{
						state: "unavailable",
						label: "rep 2",
						reason: "a stage group has no session context",
					},
				],
			});
		});

		it("names a group directory with no group.json as unreadable by its record id", async () => {
			const fixture = await writtenFixture();
			await mkdir(join(fixture.runsDirectory, "confirmations", "group-empty"), {
				recursive: true,
			});

			const { unreadable } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(unreadable).toContainEqual({
				id: "group:group-empty",
				reason: "incomplete: no group.json recorded",
			});
		});
	});

	describe("stage links on a pipeline run", () => {
		function stageLink(run: string, stage: string): ContextLink {
			return {
				state: "available",
				label: stage,
				href: `/runs/${run}/stages/${stage}`,
			};
		}

		it("links each stage that saved a checkpoint, in pipeline order, and never the initial checkpoint", async () => {
			const fixture = await writtenFixture();
			await fixture.writeInitialCheckpoint();

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(pipelineRun(rows, fixture.replayableRun)?.links).toEqual([
				stageLink(fixture.replayableRun, "discuss"),
				stageLink(fixture.replayableRun, "build"),
			]);
		});

		it("links the stage that stopped the run, whose page renders from its stop record", async () => {
			const fixture = await writtenFixture();
			await fixture.writeStoppedRun();

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(pipelineRun(rows, fixture.stoppedRun)?.links).toEqual([
				stageLink(fixture.stoppedRun, "build"),
			]);
		});

		it("links a stage left awaiting judgment by a run that was interrupted while judging", async () => {
			const fixture = await writtenFixture();
			await fixture.writeAwaitingJudgeRun();
			const store = await openRunEventStore(
				runEventsDatabaseFile(fixture.runsDirectory),
			);
			store.append({
				runId: fixture.awaitingJudgeRun,
				kind: "run-interrupted",
				stage: "build",
				spentUsd: 1,
				elapsedMs: 5000,
			});
			store.close();

			const { rows } = await runHistoryReport(
				fixture.runsDirectory,
				directorySource(await corpusDirectory("build skill\n")),
				nothingRunning,
			);

			expect(pipelineRun(rows, fixture.awaitingJudgeRun)).toMatchObject({
				status: "INTERRUPTED",
				links: [stageLink(fixture.awaitingJudgeRun, "build")],
			});
		});
	});
});
