import { mkdir } from "node:fs/promises";
import type { z } from "zod";
import { buildComparisonReport } from "./comparison-report";
import { serializeComparisonReport } from "./comparison-record";
import { comparisonEvidenceFixture } from "./comparison-test-fixtures";
import type { CheckpointRecord, HashedFile } from "./checkpoint";
import {
	captureStageCorpus,
	INITIAL_CHECKPOINT_STAGE,
	parseCheckpointRecord,
	stageCorpusRoots,
} from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { hashCorpusFiles, resolveCorpusFile } from "./corpus-file";
import type { Immutable } from "./contracts";
import {
	confirmationGroupRecordSchema,
	sessionConfirmationGroupRecordSchema,
	sessionConfirmationRepRecordSchema,
} from "./confirmation-record";
import type {
	ConfirmationGroupRecord,
	SessionConfirmationGroupRecord,
	SessionConfirmationRepRecord,
} from "./confirmation-record";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type { RunLiveness } from "./run-liveness";
import type { RunEventKind } from "./run-events";
import { openRunEventStore } from "./run-events";
import type {
	GroupReportSummaryRecord,
	RunSummaryRecord,
} from "./record-summary";
import { groupReportSummarySchema, runSummarySchema } from "./record-summary";
import type { SessionAttemptRecord } from "./session-record";
import { sessionAttemptRecordSchema } from "./session-record";
import { replayRecordSchema } from "./replay";
import { CONTROL_DIR } from "./config";
import {
	DEFAULT_STAGE_SETTINGS_FILE,
	loadStageSettings,
} from "./stage-settings";
import { join } from "node:path";
import type { SessionAttemptId, StageAttemptId } from "./run-layout";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	comparisonReportPaths,
	confirmationGroupPaths,
	replayRecordFile,
	runEventsDatabaseFile,
	sessionAttemptPaths,
} from "./run-layout";

const CASE_ID = "audit-log";
const SOURCE_ROOT = "/sources/template";
const CORPUS_DIGEST = "a".repeat(64);
const COMPARISON_DIGEST = "c".repeat(64);

/**
 * Session content a stop record carries and a history report must not repeat.
 * The record the harness writes holds the judge's own input, a parsed
 * transcript among it, so a test asserting the report excludes that content
 * needs the content to exist in the fixture first.
 */
export const STOPPED_STAGE_SESSION_ID = "3d5f9c11-0000-4000-8000-000000000042";
export const STOPPED_STAGE_EXCHANGE_TEXT = "the stopped stage answered";

/**
 * Session content a record whose judging never completed carries, in the
 * judge's input written before judging started.
 */
export const AWAITING_JUDGE_SESSION_ID = "7c1e4a88-0000-4000-8000-000000000043";
export const AWAITING_JUDGE_EXCHANGE_TEXT =
	"the stage awaiting judgment answered";

/**
 * The settings evidence an ordinary fixture record carries when the caller
 * names none. A literal, so writing a record never reads the repository's root
 * stage-settings.json. A test whose assertions depend on that file passes
 * `liveStageSettings()` instead, and so declares the dependency at its own
 * call site.
 */
const SETTINGS_DIGEST: HashedFile = {
	path: DEFAULT_STAGE_SETTINGS_FILE,
	sha256: "d".repeat(64),
};

type ParsedReplayRecord = z.infer<typeof replayRecordSchema>;

type LegacyGroupRecord = Omit<ConfirmationGroupRecord, "caseId">;

/**
 * Every shape this fixture writes: the parsed records, and the group record as
 * it was written before it named a case, which the parser still reads by
 * filling that field with the legacy default.
 */
type WrittenRecord =
	| CheckpointRecord
	| ParsedReplayRecord
	| ConfirmationGroupRecord
	| SessionConfirmationGroupRecord
	| SessionConfirmationRepRecord
	| LegacyGroupRecord
	| GroupReportSummaryRecord
	| RunSummaryRecord
	| SessionAttemptRecord;

function serialize(record: Immutable<WrittenRecord>): string {
	return `${JSON.stringify(record, null, 2)}\n`;
}

function manifest(
	timestamp: string,
	sourceRoot: string,
	caseId = CASE_ID,
): RunManifest {
	return {
		caseId,
		timestamp,
		controlSha: "1".repeat(40),
		sourceRoot,
		sourceSha: "2".repeat(40),
		taskId: "ACT-1",
		taskSha: "3".repeat(40),
		task: "add an audit log module",
		productBrief: "the brief",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipelinePath: "cases/audit-log/pipelines/default.json",
		pipeline: {
			statuses: ["To Do", "Build", "Done"],
			target: {
				checks: [{ command: ["bun", "run", "typecheck"] }],
				integrityFiles: ["package.json"],
			},
			stages: [
				{
					name: "discuss",
					kind: "planning",
					skill: "discuss",
					rubric: "discuss.json",
					requiresAcceptanceCriteria: false,
				},
				{
					name: "build",
					kind: "delivery",
					skill: "build",
					rubric: "build.json",
				},
			],
		},
	};
}

/**
 * The liveness answer for a fixture with no run in flight: every run it writes
 * is finished, so nothing should reach a pid probe. A test that wants a run
 * reported as running supplies its own answer instead.
 */
export const nothingRunning: RunLiveness = {
	readMarker: () => Promise.resolve(undefined),
	isAlive: () => false,
};

/**
 * A directory in corpus layout, named the way `resolveCorpusSource` names one,
 * so a test can hand a fixture or a staleness report the same value the
 * command would have resolved.
 */
export function directorySource(root: string): CorpusRoot {
	return { kind: "directory", root };
}

export function corpusPath(stage: string): string {
	return `skills/${stage}/SKILL.md`;
}

function checkpoint(
	stage: string,
	layoutPath: string,
	settingsFile?: HashedFile,
): CheckpointRecord {
	return {
		stage,
		targetSha: "2".repeat(40),
		lineage: `lineage-${stage}`,
		upstream: stage === "discuss" ? "root-lineage" : "lineage-discuss",
		model: "sonnet",
		corpusFiles: [{ path: layoutPath, sha256: CORPUS_DIGEST }],
		artifacts: [],
		workflowState: [],
		settingsFile,
	};
}

function initialCheckpoint(settingsFile: HashedFile): CheckpointRecord {
	return {
		stage: INITIAL_CHECKPOINT_STAGE,
		targetSha: "2".repeat(40),
		lineage: "lineage-initial",
		upstream: "root-lineage",
		model: "sonnet",
		corpusFiles: [],
		artifacts: [],
		workflowState: [],
		settingsFile,
	};
}

/**
 * Every field a group record carries except the case it names. The legacy
 * shape written before that field existed is this literal, so it is built by
 * never adding the field rather than by adding it and taking it back off, and
 * the parsed record is this literal plus the field.
 */
function groupFieldsWithoutCaseId(groupId: string): LegacyGroupRecord {
	return {
		schemaVersion: 1,
		groupId,
		mode: "stage",
		reps: 2,
		declaredStages: ["build"],
		inputs: {
			lineage: {
				kind: "CHECKPOINT",
				lineage: "lineage-build",
				targetSha: "2".repeat(40),
			},
			files: [
				{
					kind: "corpus",
					path: "inputs/corpus/build/SKILL.md",
					sha256: CORPUS_DIGEST,
				},
			],
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			pipelinePath: "cases/audit-log/pipelines/default.json",
		},
		projectedCost: { reps: 2, perRepMaximumUsd: 20, totalMaximumUsd: 40 },
		approval: { method: "yes", approved: true },
		repRecords: [1, 2].map((ordinal) => ({
			repId: `${groupId}-rep-${ordinal}`,
			ordinal,
			path: `reps/${groupId}-rep-${ordinal}/rep.json`,
		})),
		reportFile: "report.json",
		makespanMs: 200,
	};
}

function group(groupId: string): ConfirmationGroupRecord {
	return confirmationGroupRecordSchema.parse({
		...groupFieldsWithoutCaseId(groupId),
		caseId: CASE_ID,
	});
}

/**
 * The reliability and resource halves of the report a group writes beside its
 * record: `--json` prints the group record, and the summary reads this.
 */
function groupReport(): GroupReportSummaryRecord {
	return groupReportSummarySchema.parse({
		reliability: [
			{
				name: "build",
				requested: 2,
				attempted: 2,
				notReached: 0,
				failed: 1,
				successful: 1,
				successRate: 0.5,
				standardError: 0.35355339059327373,
				passK: 0.25,
			},
		],
		resources: { total: { costUsd: [1.25, 2.75] } },
	});
}

function replayRecord(runName: string, timestamp: string): ParsedReplayRecord {
	return replayRecordSchema.parse({
		replay: true,
		timestamp,
		runName,
		stage: "build",
		consumed: {
			stage: "discuss",
			lineage: "lineage-discuss",
			targetSha: "2".repeat(40),
		},
		baseSha: "2".repeat(40),
		lineage: "lineage-build",
		corpusFiles: [{ path: corpusPath("build"), sha256: CORPUS_DIGEST }],
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		controlSha: "1".repeat(40),
		stageCostUsd: 1,
		productOwnerCostUsd: 0.25,
		judgeCostUsd: 0.5,
		stale: false,
		staleness: [],
		scorecard: {
			stage: "build",
			costUsd: 1,
			grade: { grade: "A", verdict: "CONTINUE", dimensions: [] },
		},
	});
}

function sessionAttempt(caseId: string): SessionAttemptRecord {
	return sessionAttemptRecordSchema.parse({
		schemaVersion: 1,
		caseId,
		lineage: "session-lineage",
		model: "sonnet",
		sessionBudgetUsd: 2,
		corpusFiles: [
			{
				path: "output-styles/brief.md",
				resolvedPath: "/corpus/output-styles/brief.md",
				sha256: CORPUS_DIGEST,
			},
		],
		prompt: "write the reply",
		reply: "the reply",
		transcriptFile: "transcript.jsonl",
		transcriptDiagnostics: {
			state: "complete",
			prefixLinesExcluded: 0,
			sourceLineCount: 4,
			measuredLineCount: 4,
			toolUseOccurrences: {
				total: 2,
				byName: [{ name: "Bash", count: 2 }],
			},
			toolErrors: [],
			repeatedBashCommands: [
				{
					commandSha256:
						"fdb7f3c40645e79ca4c5d1638753243ccb283f5dd126ceb21de5fa7d40953c65",
					commandCharacters: 161,
					preview: "x".repeat(160),
					previewTruncated: true,
					occurrences: [
						{ toolUseId: "bash-1", location: { line: 1, block: 1 } },
						{ toolUseId: "bash-2", location: { line: 3, block: 1 } },
					],
				},
			],
			issues: [],
		},
		metrics: {
			costUsd: 0.5,
			inputTokens: 10,
			outputTokens: 20,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			turns: 1,
		},
		outcome: "SUCCESSFUL",
		checks: [{ kind: "word-band", status: "PASS", detail: "120 words" }],
		elapsedMs: 1000,
	});
}

/**
 * The settings evidence the repository's root stage-settings.json holds right
 * now. A test whose assertions depend on that file, because it asserts a run is
 * not stale, passes this and so says at its own call site that it reads the
 * live file.
 */
export async function liveStageSettings(): Promise<HashedFile> {
	const loaded = await loadStageSettings(
		join(CONTROL_DIR, DEFAULT_STAGE_SETTINGS_FILE),
	);

	return loaded.hashed;
}

export interface RecordedRunsOptions {
	readonly settingsFile?: HashedFile;
	readonly sourceRoot?: string;
}

/**
 * Every record kind `list` and `show` read, written at the paths `run-layout`
 * builds, under a root the caller owns. Nothing on this machine has recorded a
 * pipeline run, a checkpoint, a group, or a comparison, so this is the only
 * way those listings are observable; writing at the real layout paths is what
 * keeps the observation about the harness rather than about the fixture.
 */
export class RecordedRunsFixture {
	public readonly replayableRun = "2026-09-03T00-00-00.000Z";
	public readonly unreplayableRun = "2026-09-02T00-00-00.000Z";
	public readonly groupId = "group-1";
	public readonly comparisonDigest = COMPARISON_DIGEST;
	public readonly stages: readonly string[] = ["discuss", "build"];
	public readonly sessionAttempt: SessionAttemptId = {
		caseId: "smoke",
		uuid: "0f6b6f2a-0000-4000-8000-000000000001",
	};
	public readonly stageAttempt: StageAttemptId = {
		lineage: "lineage-discuss",
		timestamp: "2026-09-03T01-00-00.000Z",
	};
	public readonly stoppedRun = "2026-09-04T00-00-00.000Z";
	public readonly noRecordRun = "2026-09-05T00-00-00.000Z";
	public readonly interruptedRun = "2026-09-06T00-00-00.000Z";
	public readonly runningRun = "2026-09-07T00-00-00.000Z";
	public readonly abortedRun = "2026-09-08T00-00-00.000Z";
	public readonly awaitingJudgeRun = "2026-09-09T00-00-00.000Z";
	public readonly eventsOnlyRun = "2026-09-10T00-00-00.000Z";

	private readonly settingsFile: HashedFile;
	private readonly sourceRoot: string;

	public constructor(
		public readonly runsDirectory: string,
		options: RecordedRunsOptions = {},
	) {
		this.settingsFile = options.settingsFile ?? SETTINGS_DIGEST;
		this.sourceRoot = options.sourceRoot ?? SOURCE_ROOT;
	}

	public get stageAttemptFile(): string {
		return replayRecordFile(
			this.runsDirectory,
			this.stageAttempt.lineage,
			this.stageAttempt.timestamp,
		);
	}

	public get sessionAttemptFile(): string {
		return sessionAttemptPaths(this.runsDirectory, this.sessionAttempt)
			.recordFile;
	}

	/**
	 * Re-records every checkpoint's corpus files by hashing a real corpus
	 * through the same resolver and roots `stale` reads it by, so a staleness
	 * observation compares what the harness records against what it would
	 * record today rather than against a digest this fixture made up. Taking a
	 * corpus root rather than a directory path is what lets the live install be
	 * recorded against too.
	 */
	public async recordCorpusFrom(
		source: CorpusRoot,
		run = this.replayableRun,
	): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, run);
		const instructions = await Bun.file(
			resolveCorpusFile(source, "CLAUDE.md"),
		).text();
		const roots = stageCorpusRoots(source, this.sourceRoot);

		for (const stage of this.stages) {
			const corpusFiles = await captureStageCorpus(stage, instructions, roots);
			const directory = paths.checkpointDirectory(stage);
			const record = parseCheckpointRecord(
				await Bun.file(checkpointRecordFile(directory)).text(),
			);
			await Bun.write(
				checkpointRecordFile(directory),
				serialize({ ...record, corpusFiles }),
			);
		}
	}

	public async writePipelineRun(
		run: string,
		caseId: string,
		settingsFile?: HashedFile,
	): Promise<void> {
		const recordedSettings = settingsFile ?? this.settingsFile;
		const paths = benchmarkRunPaths(this.runsDirectory, run);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await writeRunManifest(
			paths.manifestFile,
			manifest(run, this.sourceRoot, caseId),
		);

		for (const stage of this.stages) {
			const directory = paths.checkpointDirectory(stage);
			await mkdir(directory, { recursive: true });
			await Bun.write(
				checkpointRecordFile(directory),
				serialize(checkpoint(stage, corpusPath(stage), recordedSettings)),
			);
		}

		await Bun.write(
			paths.artifactFile,
			serialize(this.artifact(run, "COMPLETE", caseId)),
		);
	}

	public async writeInitialCheckpoint(
		run = this.replayableRun,
		settingsFile?: HashedFile,
	): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, run);
		const directory = paths.checkpointDirectory(INITIAL_CHECKPOINT_STAGE);
		await mkdir(directory, { recursive: true });
		await Bun.write(
			checkpointRecordFile(directory),
			serialize(initialCheckpoint(settingsFile ?? this.settingsFile)),
		);
	}

	public async recordSettingsFile(
		settingsFile: HashedFile | undefined,
		run = this.replayableRun,
	): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, run);
		for (const stage of [INITIAL_CHECKPOINT_STAGE, ...this.stages]) {
			const file = Bun.file(
				checkpointRecordFile(paths.checkpointDirectory(stage)),
			);
			if (!(await file.exists())) {
				continue;
			}
			const record = parseCheckpointRecord(await file.text());
			await Bun.write(file, serialize({ ...record, settingsFile }));
		}
	}

	/**
	 * One session attempt for a case, recording the digests a corpus directory
	 * holds right now, so a later comparison against an edited corpus is a
	 * comparison of real bytes rather than of a digest this fixture invented.
	 */
	public async writeAttemptReading(
		corpusRoot: string,
		caseId: string,
		layoutPaths: readonly string[],
	): Promise<void> {
		await this.writeAttemptAt(
			this.sessionAttempt.uuid,
			corpusRoot,
			caseId,
			layoutPaths,
		);
	}

	/**
	 * One attempt under a uuid the caller names, so a test can put two attempts
	 * for one case on disk and set their modification times itself. Recency is
	 * decided by mtime today, and without two records nothing observes that.
	 */
	public async writeAttemptAt(
		uuid: string,
		corpusRoot: string,
		caseId: string,
		layoutPaths: readonly string[],
	): Promise<string> {
		const corpusFiles = await hashCorpusFiles(
			directorySource(corpusRoot),
			layoutPaths,
		);
		const { recordFile } = sessionAttemptPaths(this.runsDirectory, {
			caseId,
			uuid,
		});
		await Bun.write(
			recordFile,
			serialize(
				sessionAttemptRecordSchema.parse({
					...sessionAttempt(caseId),
					corpusFiles,
				}),
			),
		);

		return recordFile;
	}

	public async writeGroupReport(groupId: string): Promise<void> {
		const paths = confirmationGroupPaths(this.runsDirectory, groupId);
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(paths.reportFile, serialize(groupReport()));
	}

	public async write(): Promise<void> {
		await this.writeReplayableRun();
		await this.writeUnreplayableRun();
		await this.writeGroup();
		await this.writeGroupReport(this.groupId);
		await this.writeComparison();
		await this.writeSessionAttempt();
		await this.writeStageAttempt();
	}

	/**
	 * A group whose record declares no case: the parser fills the legacy default,
	 * and a reader can watch that default reach the summary without any file on
	 * this machine having been written before the field existed.
	 */
	public async writeGroupWithoutCaseId(groupId: string): Promise<void> {
		const paths = confirmationGroupPaths(this.runsDirectory, groupId);
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(
			paths.groupFile,
			serialize(groupFieldsWithoutCaseId(groupId)),
		);
	}

	/**
	 * An attempt directory whose record is half-written, which is how a run that
	 * died mid-write leaves one behind.
	 */
	public async writeUnreadableAttempt(
		caseId: string,
		uuid: string,
	): Promise<void> {
		await Bun.write(
			sessionAttemptPaths(this.runsDirectory, { caseId, uuid }).recordFile,
			"{ not json\n",
		);
	}

	/**
	 * An attempt directory a run created and died before writing anything into,
	 * which is what three of this repository's own session directories are.
	 */
	public async writeEmptyAttemptDirectory(
		caseId: string,
		uuid: string,
	): Promise<void> {
		await mkdir(
			sessionAttemptPaths(this.runsDirectory, { caseId, uuid }).directory,
			{ recursive: true },
		);
	}

	/**
	 * A checkpoint stage directory a run created and died before writing a
	 * checkpoint.json into, so its lister reports it as incomplete rather
	 * than reading it.
	 */
	public async writeEmptyCheckpointDirectory(stage: string): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.replayableRun);
		await mkdir(paths.checkpointDirectory(stage), { recursive: true });
	}

	/**
	 * A run that stopped at a stage: its checkpoints directory and manifest
	 * exist, an earlier stage's file holds a judged scorecard, and the stopping
	 * stage's file holds a stop record instead of a scorecard. No artifact file
	 * is ever written for a run that stops.
	 */
	public async writeStoppedRun(): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.stoppedRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await writeRunManifest(
			paths.manifestFile,
			manifest(this.stoppedRun, this.sourceRoot),
		);
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify(
				{
					stage: "discuss",
					costUsd: 1,
					grade: { grade: "A", verdict: "CONTINUE", dimensions: [] },
					input: {},
				},
				null,
				2,
			)}\n`,
		);
		await Bun.write(
			paths.stageFile("build"),
			`${JSON.stringify(
				{
					status: "STAGE_JUDGE_FAILED",
					stage: "build",
					error: "build stage graded F; minimum grade is B",
					input: {
						transcript: {
							sessionId: STOPPED_STAGE_SESSION_ID,
							exchanges: [{ agent: { message: STOPPED_STAGE_EXCHANGE_TEXT } }],
						},
					},
				},
				null,
				2,
			)}\n`,
		);
	}

	/**
	 * A run interrupted between its stage session finishing and its judging
	 * completing: the stage file holds the judge's pending input under
	 * `AWAITING_STAGE_JUDGE` and nothing overwrote it. It carries the three
	 * fields the oldest such record on disk has, since the writer gained the
	 * rest after that one was written and a reader must still read both shapes.
	 * An earlier stage holds a judged scorecard, so a reader that mistakes one
	 * for the other has somewhere to be caught.
	 */
	public async writeAwaitingJudgeRun(): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.awaitingJudgeRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await writeRunManifest(
			paths.manifestFile,
			manifest(this.awaitingJudgeRun, this.sourceRoot),
		);
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify(
				{
					stage: "discuss",
					costUsd: 1,
					grade: { grade: "A", verdict: "CONTINUE", dimensions: [] },
					input: {},
				},
				null,
				2,
			)}\n`,
		);
		await Bun.write(
			paths.stageFile("build"),
			`${JSON.stringify(
				{
					status: "AWAITING_STAGE_JUDGE",
					stage: "build",
					input: {
						transcript: {
							stage: "build",
							sessionId: AWAITING_JUDGE_SESSION_ID,
							costUsd: 1.5,
							providerCalls: 3,
							exchanges: [{ agent: { message: AWAITING_JUDGE_EXCHANGE_TEXT } }],
						},
					},
				},
				null,
				2,
			)}\n`,
		);
	}

	/**
	 * A stopped run whose manifest never got written, so loading it to report
	 * the stopping stage throws an error naming the missing manifest's path.
	 */
	public async writeStoppedRunWithoutManifest(): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.stoppedRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await Bun.write(
			paths.stageFile("build"),
			`${JSON.stringify(
				{
					status: "STAGE_JUDGE_FAILED",
					stage: "build",
					error: "build stage graded F; minimum grade is B",
					input: {
						transcript: {
							sessionId: STOPPED_STAGE_SESSION_ID,
							exchanges: [{ agent: { message: STOPPED_STAGE_EXCHANGE_TEXT } }],
						},
					},
				},
				null,
				2,
			)}\n`,
		);
	}

	/**
	 * A run that died before any stage finished: only its checkpoints directory
	 * and manifest exist, which is what three of this repository's own runs are.
	 */
	public async writeNoRecordRun(): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.noRecordRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await writeRunManifest(
			paths.manifestFile,
			manifest(this.noRecordRun, this.sourceRoot),
		);
	}

	/**
	 * A run a kill -9 ended: no terminal artifact, no STAGE_JUDGE_FAILED file
	 * (nothing runs to write one), only its checkpoints directory, manifest,
	 * and a run-interrupted event a reconciliation pass appended.
	 */
	public async writeInterruptedRun(): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.interruptedRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await writeRunManifest(
			paths.manifestFile,
			manifest(this.interruptedRun, this.sourceRoot),
		);
		const store = await openRunEventStore(
			runEventsDatabaseFile(this.runsDirectory),
		);
		store.append({
			runId: this.interruptedRun,
			kind: "run-interrupted",
			stage: "build",
			spentUsd: 1,
			elapsedMs: 5000,
		});
		store.close();
	}

	/**
	 * A run still executing: its checkpoints directory and manifest exist, no
	 * artifact and no stop record has been written, and its latest event is
	 * non-terminal. This is what every run looks like between its first stage
	 * starting and its artifact landing, so a reader that drops it drops every
	 * run in flight.
	 */
	public async writeRunningRun(
		kind: RunEventKind = "turn-completed",
		stage = "build",
		spentUsd = 0.9,
		elapsedMs = 9000,
	): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.runningRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await writeRunManifest(
			paths.manifestFile,
			manifest(this.runningRun, this.sourceRoot),
		);
		const store = await openRunEventStore(
			runEventsDatabaseFile(this.runsDirectory),
		);
		store.append({
			runId: this.runningRun,
			kind: "stage-started",
			stage,
			spentUsd: 0,
			elapsedMs: 0,
		});
		store.append({ runId: this.runningRun, kind, stage, spentUsd, elapsedMs });
		store.close();
	}

	/**
	 * A run a signal aborted mid-stage before any artifact was pending: the
	 * abort handler records `run-failed` and no artifact file is ever written
	 * (`run-abort.ts`'s `markAborted`). So the run has a terminal event, no
	 * artifact, no stop record, and is not `run-interrupted`, which is the one
	 * combination that reaches the running check with a finished run.
	 */
	public async writeSignalAbortedRun(): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.abortedRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await writeRunManifest(
			paths.manifestFile,
			manifest(this.abortedRun, this.sourceRoot),
		);
		const store = await openRunEventStore(
			runEventsDatabaseFile(this.runsDirectory),
		);
		store.append({
			runId: this.abortedRun,
			kind: "stage-started",
			stage: "build",
			spentUsd: 0,
			elapsedMs: 0,
		});
		store.append({
			runId: this.abortedRun,
			kind: "run-failed",
			stage: "build",
			spentUsd: 2,
			elapsedMs: 7000,
		});
		store.close();
	}

	/**
	 * An interrupted run whose manifest never got written, so loading it to
	 * report its case ID throws an error naming the missing manifest's path.
	 */
	public async writeInterruptedRunWithoutManifest(): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.interruptedRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		const store = await openRunEventStore(
			runEventsDatabaseFile(this.runsDirectory),
		);
		store.append({
			runId: this.interruptedRun,
			kind: "run-interrupted",
			stage: "build",
			spentUsd: 1,
			elapsedMs: 5000,
		});
		store.close();
	}

	/**
	 * A session-mode group of two reps where only the first `recordedReps`
	 * recorded their attempt. One is how a group interrupted between reps is
	 * left. Returns the rep ids in ordinal order.
	 */
	public async writeSessionGroup(
		groupId: string,
		recordedReps = 1,
	): Promise<readonly [string, string]> {
		const repIds = [`${groupId}-rep-1`, `${groupId}-rep-2`] as const;
		const paths = confirmationGroupPaths(this.runsDirectory, groupId);
		const { caseId } = this.sessionAttempt;
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(
			paths.groupFile,
			serialize(
				sessionConfirmationGroupRecordSchema.parse({
					schemaVersion: 2,
					caseId,
					groupId,
					mode: "session",
					reps: 2,
					declaredStages: ["checks"],
					inputs: {
						lineage: { kind: "SESSION", lineage: "session-lineage" },
						files: [
							{ kind: "case", path: "inputs/case.json", sha256: CORPUS_DIGEST },
						],
						model: "sonnet",
						sessionBudgetUsd: 1,
					},
					projectedCost: {
						reps: 2,
						perRepMaximumUsd: 1,
						preflightMaximumUsd: 0,
						totalMaximumUsd: 2,
					},
					preflight: { status: "MISSING", missing: "metrics unavailable" },
					approval: { method: "yes", approved: true },
					repRecords: repIds.map((repId, index) => ({
						repId,
						ordinal: index + 1,
						path: `reps/${repId}/rep.json`,
					})),
					reportFile: "report.json",
					makespanMs: 1,
				}),
			),
		);
		for (const [index, repId] of repIds.slice(0, recordedReps).entries()) {
			await this.writeSessionRep(groupId, repId, index + 1);
		}

		return repIds;
	}

	/**
	 * A run that failed before it created its checkpoints directory, so the
	 * event stream is the only record it ever ran.
	 */
	public async writeEventsOnlyFailedRun(): Promise<void> {
		await this.appendRunEvents([{ kind: "run-failed", stage: "shape" }]);
	}

	/**
	 * A run whose failure event names no stage, which is what the runner
	 * records when the failure is caught outside any stage it tracks. The
	 * stages it started are the only record of where it was.
	 */
	public async writeEventsOnlyFailedRunNamingNoStage(
		startedStages: readonly string[],
	): Promise<void> {
		await this.appendRunEvents([
			...startedStages.map((stage) => ({
				kind: "stage-started" as const,
				stage,
			})),
			{ kind: "run-failed", stage: "" },
		]);
	}

	private async appendRunEvents(
		events: readonly { readonly kind: RunEventKind; readonly stage: string }[],
	): Promise<void> {
		const store = await openRunEventStore(
			runEventsDatabaseFile(this.runsDirectory),
		);
		for (const { kind, stage } of events) {
			store.append({
				runId: this.eventsOnlyRun,
				kind,
				stage,
				spentUsd: 0,
				elapsedMs: 100,
			});
		}
		store.close();
	}

	/**
	 * A checkpoints directory with nothing in it and no event, which is what a
	 * test that names its own run leaves behind.
	 */
	public async writeEmptyRunDirectory(run: string): Promise<void> {
		await mkdir(
			benchmarkRunPaths(this.runsDirectory, run).checkpointsDirectory,
			{
				recursive: true,
			},
		);
	}

	private async writeSessionRep(
		groupId: string,
		repId: string,
		ordinal: number,
	): Promise<void> {
		const { caseId } = this.sessionAttempt;
		const rep = confirmationGroupPaths(this.runsDirectory, groupId).rep(repId);
		await Bun.write(
			rep.recordFile,
			serialize(
				sessionConfirmationRepRecordSchema.parse({
					schemaVersion: 2,
					caseId,
					groupId,
					repId,
					ordinal,
					mode: "session",
					lineage: { kind: "SESSION", lineage: "session-lineage" },
					outcome: "UNSUCCESSFUL",
					stages: [
						{
							stage: "checks",
							status: "NOT_REACHED",
							reason: "not reached",
							evidence: { recordFile: "attempt.json" },
						},
					],
					finalOutcome: { status: "NOT_APPLICABLE" },
					metrics: { status: "MISSING", calls: [], missing: ["metrics"] },
					workerTrajectorySteps: 0,
					elapsedMs: 1,
				}),
			),
		);
		await Bun.write(rep.attemptFile, serialize(sessionAttempt(caseId)));
	}

	/**
	 * A second replay filed under the fixture's replay lineage, of another
	 * run, so two replays of one lineage are told apart by their source run.
	 */
	public async writeReplayOf(run: string, timestamp: string): Promise<void> {
		await Bun.write(
			replayRecordFile(
				this.runsDirectory,
				this.stageAttempt.lineage,
				timestamp,
			),
			serialize(replayRecord(run, timestamp)),
		);
	}

	public async writeUnreadableGroup(groupId: string): Promise<void> {
		const paths = confirmationGroupPaths(this.runsDirectory, groupId);
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(paths.groupFile, "{ not json\n");
	}

	private async writeReplayableRun(): Promise<void> {
		await this.writePipelineRun(this.replayableRun, CASE_ID);
	}

	private async writeUnreplayableRun(): Promise<void> {
		const paths = benchmarkRunPaths(this.runsDirectory, this.unreplayableRun);
		await mkdir(paths.checkpointsDirectory, { recursive: true });
		await Bun.write(
			paths.artifactFile,
			serialize(this.artifact(this.unreplayableRun, "FAILED")),
		);
	}

	private artifact(
		timestamp: string,
		status: string,
		caseId = CASE_ID,
	): RunSummaryRecord {
		return runSummarySchema.parse({
			caseId,
			timestamp,
			status,
			grade: {
				verdict: status === "COMPLETE" ? "PASS" : "FAIL",
				summary: "the final judge's summary",
				requirements: [],
			},
			productOwnerCostUsd: 0.25,
			judgeCostUsd: 1.5,
			workflow: this.stages.map((stage, index) => ({
				stage,
				costUsd: index + 1,
			})),
			stageScorecards: this.stages.map((stage, index) => ({
				stage,
				costUsd: index + 1,
				grade: {
					grade: index === 0 ? "A" : "B",
					verdict: "CONTINUE",
					dimensions: [],
				},
			})),
		});
	}

	private async writeGroup(): Promise<void> {
		const paths = confirmationGroupPaths(this.runsDirectory, this.groupId);
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(paths.groupFile, serialize(group(this.groupId)));
	}

	private async writeComparison(): Promise<void> {
		const paths = comparisonReportPaths(
			this.runsDirectory,
			this.comparisonDigest,
		);
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(
			paths.reportFile,
			serializeComparisonReport(
				buildComparisonReport(comparisonEvidenceFixture(), {
					skippedCalibrations: 0,
					baselines: [],
				}),
			),
		);
	}

	private async writeStageAttempt(): Promise<void> {
		await Bun.write(
			this.stageAttemptFile,
			serialize(replayRecord(this.replayableRun, this.stageAttempt.timestamp)),
		);
	}

	private async writeSessionAttempt(): Promise<void> {
		const file = this.sessionAttemptFile;
		await Bun.write(
			file,
			serialize(sessionAttempt(this.sessionAttempt.caseId)),
		);
	}
}
