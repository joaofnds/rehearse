import type { Immutable } from "#benchmark/contracts";
import { parseRubricIds } from "#benchmark/judge";
import type { SessionJudgeRecord } from "#benchmark/session-judge-contract";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import type {
	RepSessionRecordId,
	SessionAttemptRecordId,
} from "#cli/record-id";
import { formatRecordId, parseRecordId } from "#cli/record-id";
import savedAttemptFile from "#server/attempt-evidence-file";
import {
	readRepSessionEvidence,
	sessionEvidence,
} from "#server/attempt-session-evidence";
import type { ConstructedEvidenceFile } from "#server/constructed-evidence-file";
import { SessionHistoryReaderError } from "#server/session-history-reader";

interface SessionReviewRequest {
	readonly runsDirectory: string;
	readonly id: string;
}
interface ReviewSource {
	readonly file: string;
	readonly id: string;
	readonly judge: Immutable<SessionJudgeRecord> | undefined;
	readonly requirements: readonly string[];
	readonly root: string;
	readonly sourceSha256: string;
}

async function reviewSource(
	request: SessionReviewRequest,
): Promise<ReviewSource> {
	const id = parseSessionReviewId(request.id);

	const { root, saved } = await savedAttemptFile(request.runsDirectory, id);

	const record = sessionAttemptRecordSchema.parse(
		JSON.parse(verifiedReviewText(saved)),
	);
	if (id.kind === "rep:session") {
		await readRepSessionEvidence(root, id, record);
	} else {
		sessionEvidence(record, id.caseId);
	}

	const { judge } = record;
	return {
		file: `${saved.path}.review.json`,
		id: formatRecordId(id),
		judge,
		requirements:
			judge === undefined ? [] : parseRubricIds(judge.definition.rubric),
		root,
		sourceSha256: saved.sourceSha256,
	};
}

function parseSessionReviewId(
	text: string,
): SessionAttemptRecordId | RepSessionRecordId {
	const id = parseRecordId(text);
	if (id.kind !== "attempt:session" && id.kind !== "rep:session") {
		throw new SessionHistoryReaderError(
			"refused",
			"Review requires a saved session attempt",
		);
	}

	return id;
}

function verifiedReviewText(saved: ConstructedEvidenceFile): string {
	if (
		Bun.CryptoHasher.hash("sha256", saved.text, "hex") !== saved.sourceSha256
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved session is not valid UTF-8",
		);
	}
	return saved.text;
}

export { reviewSource as default };
export type { ReviewSource, SessionReviewRequest };
