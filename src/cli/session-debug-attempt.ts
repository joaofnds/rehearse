import { sessionCitationMap } from "#benchmark/attempt-corpus-overlay";
import type { Immutable } from "#benchmark/contracts";
import { startTime } from "#benchmark/recorded-time";
import type { SessionAttempt } from "#benchmark/session-attempt";
import SessionInvocationError from "#benchmark/session-invocation-error";
import { buildSessionAttemptRecord } from "#benchmark/session-record";

import type { PreparedSessionDebugAttempt } from "./session-attempt-preparation";
import prepareSessionDebugAttempt from "./session-attempt-preparation";
import writeAttemptRecord from "./session-attempt-record-file";
import attempted from "./session-attempt-refusal";
import type {
	SessionRunOutcome,
	SessionRunRequest,
} from "./session-run-contract";

interface SessionAttemptRecording {
	readonly evidence: PreparedSessionDebugAttempt;
	readonly execution: SessionRunRequest;
}

class SessionAttemptRecorder {
	private readonly evidence: PreparedSessionDebugAttempt;
	private readonly execution: SessionRunRequest;
	private readonly startedAt: string;
	private readonly attemptStart: number;
	private readonly now: () => number;
	public constructor({ evidence, execution }: SessionAttemptRecording) {
		this.evidence = evidence;
		this.execution = execution;
		this.now = execution.now ?? Date.now;
		this.startedAt = startTime(execution.wallClock ?? Date.now);
		this.attemptStart = this.now();
	}
	private async persist(
		attempt: Immutable<SessionAttempt>,
		error?: string,
	): Promise<SessionRunOutcome> {
		const { corpus, corpusVersion, lineage, settings, versionFiles } =
			this.evidence;
		const request = this.execution;
		const record = buildSessionAttemptRecord({
			attempt,
			corpusFiles: corpus.files,
			corpusOrigin: corpus.snapshot.origin,
			corpusVersion,
			elapsedMs: this.now() - this.attemptStart,
			error,
			lineage,
			sessionCase: request.sessionCase,
			settings,
			spendCeilingUsd: request.spendCeilingUsd,
			startedAt: this.startedAt,
			versionFiles,
		});

		await writeAttemptRecord({
			inFlight: request.inFlight,
			paths: this.evidence.attemptPaths,
			record,
		});

		return { record, recordFile: this.evidence.attemptPaths.recordFile };
	}
	private async attempt(): Promise<SessionAttempt> {
		const request = this.execution;
		const { corpus, settings } = this.evidence;
		try {
			return await attempted({
				contextEvidenceSource: request.contextEvidenceSource,
				contextRateCatalog: request.contextRateCatalog,
				corpusSnapshot: corpus.snapshot,
				environment: request.environment,
				home: request.home,
				inFlight: request.inFlight,
				liveCitations: await sessionCitationMap(
					request.home,
					request.environment,
				),
				projectsDirectory: request.projectsDirectory,
				recordDirectory: this.evidence.attemptPaths.directory,
				runClaude: request.runClaude,
				sessionCase: request.sessionCase,
				settings,
			});
		} catch (error) {
			if (!(error instanceof SessionInvocationError)) {
				throw error;
			}

			await this.persist(error.attempt, error.message);
			throw error;
		}
	}
	public async run(): Promise<SessionRunOutcome> {
		const attempt = await this.attempt();
		return await this.persist(attempt);
	}
}

/**
 * Tracked whole, so an operator stop waits for the record this attempt writes
 * after its session, not only for the session.
 */
async function runSessionDebugAttempt(
	request: SessionRunRequest,
): Promise<SessionRunOutcome> {
	return await request.inFlight.track(async () => {
		const evidence = await prepareSessionDebugAttempt(request);
		return await new SessionAttemptRecorder({
			evidence,
			execution: request,
		}).run();
	});
}

export { runSessionDebugAttempt as default };
