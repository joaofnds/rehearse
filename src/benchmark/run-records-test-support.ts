import ComparisonRecords from "./recorded-runs-fixture-comparison-records";
import ConfirmationGroupRecords from "./recorded-runs-fixture-confirmation-group-records";
import CorpusRecordEvidence from "./recorded-runs-fixture-corpus-record-evidence";
import PipelineRecords from "./recorded-runs-fixture-pipeline-records";
import {
	COMPARISON_DIGEST,
	RUNNING_RUN,
	SETTINGS_DIGEST,
	SOURCE_ROOT,
} from "./recorded-runs-fixture-readings";
import RunEventRecords from "./recorded-runs-fixture-run-event-records";
import SessionAttemptRecords from "./recorded-runs-fixture-session-attempt-records";
import StoppedStageRecords from "./recorded-runs-fixture-stopped-stage-records";
import type { SessionAttemptId, StageAttemptId } from "./run-layout";
import { replayRecordFile, sessionAttemptPaths } from "./run-layout";
import { claimShortId } from "./short-id";
import type { ClaimSubject } from "./short-id";

interface RecordedRunsOptions {
	readonly settingsFile?: { readonly path: string; readonly sha256: string };
	readonly sourceRoot?: string;
	readonly sessionCaseId?: string;
}

class RecordedRunsFixture {
	public readonly replayableRun = "2026-09-03T00-00-00.000Z";
	public readonly unreplayableRun = "2026-09-02T00-00-00.000Z";
	public readonly groupId = "group-1";
	public readonly comparisonDigest = COMPARISON_DIGEST;
	public readonly stages: readonly string[] = ["discuss", "build"];
	public readonly sessionAttempt: SessionAttemptId;
	public readonly stageAttempt: StageAttemptId = {
		lineage: "lineage-discuss",
		timestamp: "2026-09-03T01-00-00.000Z",
	};
	public readonly stoppedRun = "2026-09-04T00-00-00.000Z";
	public readonly noRecordRun = "2026-09-05T00-00-00.000Z";
	public readonly interruptedRun = "2026-09-06T00-00-00.000Z";
	public readonly runningRun = RUNNING_RUN;
	public readonly laterRunningRun = "2026-09-07T12-00-00.000Z";
	public readonly abortedRun = "2026-09-08T00-00-00.000Z";
	public readonly awaitingJudgeRun = "2026-09-09T00-00-00.000Z";
	public readonly eventsOnlyRun = "2026-09-10T00-00-00.000Z";
	public readonly unrecordedArtifactRun = "2026-09-11T00-00-00.000Z";
	public readonly settingsFile = SETTINGS_DIGEST;
	public readonly sourceRoot: string;
	public constructor(
		public readonly runsDirectory: string,
		options: RecordedRunsOptions = {},
	) {
		this.settingsFile = options.settingsFile ?? SETTINGS_DIGEST;
		this.sourceRoot = options.sourceRoot ?? SOURCE_ROOT;
		this.sessionAttempt = {
			caseId: options.sessionCaseId ?? "smoke",
			uuid: "0f6b6f2a-0000-4000-8000-000000000001",
		};
	}
	public readonly pipeline = new PipelineRecords({ context: this });
	public readonly corpus = new CorpusRecordEvidence({
		context: this,
		pipelineRecords: this.pipeline,
	});
	public readonly sessions = new SessionAttemptRecords({
		context: this,
	});
	public readonly confirmations = new ConfirmationGroupRecords({
		context: this,
	});
	public readonly stopped = new StoppedStageRecords({
		context: this,
	});
	public readonly events = new RunEventRecords({ context: this });
	public readonly comparisons = new ComparisonRecords({ context: this });
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

	public get auditLogClaims(): readonly ClaimSubject[] {
		return [
			{ kind: "run", run: this.unreplayableRun },
			{ kind: "run", run: this.replayableRun },
			{ kind: "attempt:stage", ...this.stageAttempt },
			{ groupId: this.groupId, kind: "group" },
		];
	}

	public get smokeClaims(): readonly ClaimSubject[] {
		return [{ kind: "attempt:session", ...this.sessionAttempt }];
	}

	public async claim(
		caseId: string,
		subjects: readonly ClaimSubject[],
	): Promise<void> {
		await Array.fromAsync(subjects, async (subject) => {
			await claimShortId(this.runsDirectory, caseId, subject);
		});
	}

	public async write(): Promise<void> {
		await this.pipeline.writeReplayableRun();

		await this.pipeline.writeUnreplayableRun();

		await this.confirmations.records.writeGroup();

		await this.confirmations.records.writeGroupReport(this.groupId);

		await this.comparisons.writeComparison();

		await this.sessions.writeSessionAttempt();

		await this.sessions.writeStageAttempt();
	}
}

export { RecordedRunsFixture };
export type { RecordedRunsOptions };

export {
	CASE_ID,
	CORPUS_DIGEST,
	STOPPED_STAGE_SESSION_ID,
	STOPPED_STAGE_EXCHANGE_TEXT,
	STOPPED_RUN_EVIDENCE,
	RECORDED_READINGS,
	STOPPED_RUN_ERROR,
	FINAL_JUDGE_FAILURE,
	AWAITING_JUDGE_SESSION_ID,
	AWAITING_JUDGE_EXCHANGE_TEXT,
	NO_PROVIDER_PROJECTS,
	RUNNING_RUN,
} from "./recorded-runs-fixture-readings";
export {
	claimBy,
	nothingRunning,
	directorySource,
	fixedCorpusSource,
	corpusPath,
	liveStageSettings,
} from "./recorded-runs-fixture-environment";
