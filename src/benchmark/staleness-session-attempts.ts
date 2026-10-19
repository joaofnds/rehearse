import type { SessionCaseDeclaration } from "./case";
import { listCases } from "./case";
import type { StageCorpus } from "./checkpoint";
import { readChangedFilesOnly } from "./checkpoint";
import { textIfPresent } from "./file-presence";
import type { SessionAttemptId } from "./run-layout";
import { sessionAttemptIds, sessionAttemptPaths } from "./run-layout";
import { parseSessionAttemptRecord } from "./session-record";
import type {
	RecordStaleness,
	StalenessReport,
	UnreadableStaleRecord,
} from "./staleness-contract";
import type { CorpusJudgedAgainst } from "./staleness-current-corpus";
import { judgedReads } from "./staleness-read-manifest";
import { currentCaseCorpus, sessionCases } from "./staleness-session-corpus";

const LEGACY_SESSION_RECORD_SCHEMA_VERSION = 1;

const EMPTY_COLLECTION_LENGTH = 0;

interface SessionAttemptReading {
	readonly text: string;
	readonly current: StageCorpus;
	readonly id: string;
}
class SessionStalenessRecords {
	private readonly records: RecordStaleness[] = [];
	private readonly unreadable: UnreadableStaleRecord[];
	public constructor(
		private readonly runsDirectory: string,
		private readonly against: Omit<CorpusJudgedAgainst, "instructions">,
		private readonly listing: StalenessCaseListing,
	) {
		this.unreadable = listing.unreadable.map(({ id, reason }) => ({
			id: `case:${id}`,
			reason,
		}));
	}
	public includeUndeclared(attempts: readonly SessionAttemptId[]): void {
		const { listing } = this;
		const known = new Set([
			...listing.declarations.map(({ id }) => id),
			...listing.unreadable.map(({ id }) => id),
		]);
		for (const attempt of attempts) {
			if (!known.has(attempt.caseId)) {
				this.unreadable.push({
					id: `attempt:session:${attempt.caseId}/${attempt.uuid}`,
					reason: "corpus files unknown: case no longer declared",
				});
			}
		}
	}
	public async readCase(
		declaration: SessionCaseDeclaration,
		attempts: readonly SessionAttemptId[],
	): Promise<void> {
		const current = await currentCaseCorpus(declaration, this.against.source);
		await Array.fromAsync(attempts, async (attempt) => {
			if (attempt.caseId !== declaration.id) {
				return;
			}
			await this.readAttempt(attempt, current);
		});
	}
	public report(): StalenessReport {
		return { records: this.records, unreadable: this.unreadable };
	}
	private async readAttempt(
		attempt: SessionAttemptId,
		current: StageCorpus,
	): Promise<void> {
		const { runsDirectory } = this;
		const id = `attempt:session:${attempt.caseId}/${attempt.uuid}`;
		const text = await textIfPresent(
			sessionAttemptPaths(runsDirectory, attempt).recordFile,
		);
		if (text === undefined) {
			return;
		}
		try {
			this.records.push(await this.judgeAttempt({ current, id, text }));
		} catch (error) {
			this.unreadable.push({
				id,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	private async judgeAttempt({
		text,
		current,
		id,
	}: SessionAttemptReading): Promise<RecordStaleness> {
		const { source, underTest } = this.against;
		const record = parseSessionAttemptRecord(text);
		const reads = {
			corpusFiles: record.corpusFiles.map(({ path, sha256 }) => ({
				path,
				sha256,
			})),
			readManifest:
				record.schemaVersion === LEGACY_SESSION_RECORD_SCHEMA_VERSION
					? undefined
					: record.readManifest,
		};
		const judged = await judgedReads(reads, {
			current,
			definition: undefined,
			source,
		});
		return {
			id,
			stale: judged.causes.length > EMPTY_COLLECTION_LENGTH,
			...judged,
			distance: underTest.distanceOf(record.corpusVersion),
			onlyCorpusFiles: readChangedFilesOnly(judged),
		};
	}
}

async function sessionAttemptStalenessAgainst(
	runsDirectory: string,
	against: Omit<CorpusJudgedAgainst, "instructions">,
): Promise<StalenessReport> {
	const listing = await listCases(undefined, { includeArchived: true });
	const attempts = await sessionAttemptIds(runsDirectory);
	const reading = new SessionStalenessRecords(runsDirectory, against, listing);
	reading.includeUndeclared(attempts);
	await Array.fromAsync(
		sessionCases(listing.declarations),
		async (declaration) => {
			await reading.readCase(declaration, attempts);
		},
	);
	return reading.report();
}

type StalenessCaseListing = Awaited<ReturnType<typeof listCases>>;

export { sessionAttemptStalenessAgainst as default };
