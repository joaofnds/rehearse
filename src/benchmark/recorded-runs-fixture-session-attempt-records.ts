import { mkdir } from "node:fs/promises";

import { hashCorpusFiles } from "./corpus-file";
import type { ReadManifestEntry } from "./read-manifest";
import AttemptRecordData from "./recorded-runs-fixture-attempt-data";
import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import { directorySource } from "./recorded-runs-fixture-environment";
import { serialize } from "./recorded-runs-fixture-record-io";
import type { RecordedAttemptInputs } from "./recorded-runs-fixture-record-io";
import { replayRecordFile, sessionAttemptPaths } from "./run-layout";
import { sessionAttemptRecordSchema } from "./session-record";

interface WriteAttemptReadingRequest {
	readonly corpusRoot: string;
	readonly caseId: string;
	readonly layoutPaths: readonly string[];
}
interface WriteUnreadableAttemptRequest {
	readonly caseId: string;
	readonly uuid: string;
}
interface WriteEmptyAttemptDirectoryRequest {
	readonly caseId: string;
	readonly uuid: string;
}
interface WriteReplayOfRequest {
	readonly run: string;
	readonly timestamp: string;
	readonly elapsedMs?: number | undefined;
}

class SessionAttemptRecords {
	private readonly context: RecordedRunsContext;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
	}

	public readonly writeAttemptReading = async ({
		corpusRoot,
		caseId,
		layoutPaths,
	}: WriteAttemptReadingRequest): Promise<void> => {
		await this.writeAttemptAt(this.context.sessionAttempt.uuid, {
			caseId,
			corpusRoot,
			layoutPaths,
		});
	};

	public readonly recordAttemptReadManifest = async (
		readManifest: readonly ReadManifestEntry[],
	): Promise<void> => {
		const { recordFile } = sessionAttemptPaths(
			this.context.runsDirectory,
			this.context.sessionAttempt,
		);
		const record = sessionAttemptRecordSchema.parse(
			JSON.parse(await Bun.file(recordFile).text()),
		);

		await Bun.write(
			recordFile,
			serialize(
				sessionAttemptRecordSchema.parse({
					...record,
					readManifest,
					schemaVersion: 3,
				}),
			),
		);
	};

	public readonly recordAttemptStartedAt = async (
		startedAt: string,
	): Promise<void> => {
		const { recordFile } = sessionAttemptPaths(
			this.context.runsDirectory,
			this.context.sessionAttempt,
		);
		const record = sessionAttemptRecordSchema.parse(
			JSON.parse(await Bun.file(recordFile).text()),
		);

		await Bun.write(
			recordFile,
			serialize(
				sessionAttemptRecordSchema.parse({
					...record,
					schemaVersion: 3,
					startedAt,
				}),
			),
		);
	};

	public readonly writeAttemptAt = async (
		uuid: string,
		{ corpusRoot, caseId, layoutPaths, corpusVersion }: RecordedAttemptInputs,
	): Promise<string> => {
		const corpusFiles = await hashCorpusFiles(
			directorySource(corpusRoot),
			layoutPaths,
		);
		const { recordFile } = sessionAttemptPaths(this.context.runsDirectory, {
			caseId,
			uuid,
		});
		const recordedAttempt = sessionAttemptRecordSchema.parse({
			...AttemptRecordData.session(caseId),
			corpusFiles,
			corpusVersion,
		});

		await Bun.write(recordFile, serialize(recordedAttempt));

		return recordFile;
	};

	public readonly writeUnreadableAttempt = async ({
		caseId,
		uuid,
	}: WriteUnreadableAttemptRequest): Promise<void> => {
		await Bun.write(
			sessionAttemptPaths(this.context.runsDirectory, { caseId, uuid })
				.recordFile,
			"{ not json\n",
		);
	};

	public readonly writeEmptyAttemptDirectory = async ({
		caseId,
		uuid,
	}: WriteEmptyAttemptDirectoryRequest): Promise<void> => {
		await mkdir(
			sessionAttemptPaths(this.context.runsDirectory, { caseId, uuid })
				.directory,
			{ recursive: true },
		);
	};

	public readonly writeReplayOf = async ({
		run,
		timestamp,
		elapsedMs,
	}: WriteReplayOfRequest): Promise<void> => {
		await Bun.write(
			replayRecordFile(
				this.context.runsDirectory,
				this.context.stageAttempt.lineage,
				timestamp,
			),
			serialize({
				...AttemptRecordData.replay({ runName: run, timestamp }),
				elapsedMs,
			}),
		);
	};

	public readonly writeStageAttempt = async (): Promise<void> => {
		await Bun.write(
			this.context.stageAttemptFile,
			serialize(
				AttemptRecordData.replay({
					runName: this.context.replayableRun,
					timestamp: this.context.stageAttempt.timestamp,
				}),
			),
		);
	};

	public readonly writeSessionAttempt = async (): Promise<void> => {
		const file = this.context.sessionAttemptFile;
		await Bun.write(
			file,
			serialize(AttemptRecordData.session(this.context.sessionAttempt.caseId)),
		);
	};
}

export { SessionAttemptRecords as default };
