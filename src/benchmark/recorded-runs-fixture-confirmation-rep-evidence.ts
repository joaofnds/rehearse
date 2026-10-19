import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { hashCorpusFiles } from "./corpus-file";
import type { ReadManifestEntry } from "./read-manifest";
import AttemptRecordData from "./recorded-runs-fixture-attempt-data";
import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import { FIXTURE_JSON_INDENT_SPACES } from "./recorded-runs-fixture-readings";
import { serialize } from "./recorded-runs-fixture-record-io";
import type {
	SessionGroupRepIdentity,
	SessionRepCorpus,
} from "./recorded-runs-fixture-record-io";
import { checkpointRecordFile, confirmationGroupPaths } from "./run-layout";
import { sessionAttemptRecordSchema } from "./session-record";

interface RecordGroupRepReadManifestRequest {
	readonly repId: string;
	readonly stage: string;
	readonly readManifest: readonly ReadManifestEntry[];
}
interface RecordGroupRepCheckpointReadManifestRequest {
	readonly repId: string;
	readonly stage: string;
	readonly readManifest: readonly ReadManifestEntry[];
}

class ConfirmationRepEvidence {
	private readonly context: RecordedRunsContext;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
	}

	public readonly recordGroupRepReadManifest = async ({
		repId,
		stage,
		readManifest,
	}: RecordGroupRepReadManifestRequest): Promise<void> => {
		const file = confirmationGroupPaths(
			this.context.runsDirectory,
			this.context.groupId,
		)
			.rep(repId)
			.stageFile(stage);

		await mkdir(dirname(file), { recursive: true });

		await Bun.write(
			file,
			`${JSON.stringify(
				{ readManifest, stage },
				null,
				FIXTURE_JSON_INDENT_SPACES,
			)}\n`,
		);
	};

	public readonly recordGroupRepCheckpointReadManifest = async ({
		repId,
		stage,
		readManifest,
	}: RecordGroupRepCheckpointReadManifestRequest): Promise<void> => {
		const rep = confirmationGroupPaths(
			this.context.runsDirectory,
			this.context.groupId,
		).rep(repId);

		await mkdir(dirname(rep.stageFile(stage)), { recursive: true });

		await Bun.write(rep.stageFile(stage), `${JSON.stringify({ stage })}\n`);

		const file = checkpointRecordFile(rep.checkpointDirectory(stage));

		await mkdir(dirname(file), { recursive: true });

		await Bun.write(
			file,
			`${JSON.stringify({ readManifest }, null, FIXTURE_JSON_INDENT_SPACES)}\n`,
		);
	};

	public readonly recordSessionGroupRepAttempt = async (
		{ groupId, repId }: SessionGroupRepIdentity,
		{ corpusRoot, layoutPaths, readManifest }: SessionRepCorpus,
	): Promise<void> => {
		const { caseId } = this.context.sessionAttempt;
		const record = sessionAttemptRecordSchema.parse({
			...AttemptRecordData.session(caseId),
			corpusFiles: await hashCorpusFiles(
				{ kind: "directory", root: corpusRoot },
				layoutPaths,
			),
			readManifest,
			schemaVersion: 3,
		});
		const { attemptFile } = confirmationGroupPaths(
			this.context.runsDirectory,
			groupId,
		).rep(repId);

		await mkdir(dirname(attemptFile), { recursive: true });

		await Bun.write(attemptFile, serialize(record));
	};
}
export { ConfirmationRepEvidence as default };
