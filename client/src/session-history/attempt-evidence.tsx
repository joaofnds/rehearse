import { useQuery } from "@tanstack/react-query";

import attemptEvidenceQuery from "./attempt-evidence-query";
import { SessionEvidence } from "./session-evidence";
import SessionReviewPanel from "./session-review";
import ScorecardEvidence from "./stage-evidence";

async function readSavedRecord(id: string): Promise<string> {
	const response = await fetch(`/api/records/${encodeURIComponent(id)}`);
	if (!response.ok) {
		throw new Error(`Saved record unavailable (${String(response.status)})`);
	}
	return await response.text();
}

interface SavedRecordQuery {
	readonly queryKey: readonly ["saved-record-json", string];
	readonly queryFn: () => Promise<string>;
}

function savedRecordQuery(id: string): SavedRecordQuery {
	return {
		queryFn: async () => await readSavedRecord(id),
		queryKey: ["saved-record-json", id],
	};
}

interface AttemptEvidenceProps {
	readonly id: string;
}

function AttemptEvidence({ id }: AttemptEvidenceProps): React.JSX.Element {
	const query = useQuery(attemptEvidenceQuery(id));
	if (query.isPending) {
		return (
			<p className="text-14 text-dim">Reading saved output and assessment…</p>
		);
	}
	if (query.isError || query.data === undefined) {
		return (
			<p className="text-14 text-attention">
				Detailed output and assessment unavailable. This record may retain only
				a summary; inspect the recorded outcome above.
			</p>
		);
	}
	if (query.data.state === "unavailable") {
		return <p className="text-14 text-attention">{query.data.reason}</p>;
	}
	return query.data.kind === "session" ? (
		<div className="flex flex-col gap-4">
			<SessionEvidence record={query.data.record} />
			<SessionReviewPanel
				key={id}
				id={id}
				sourceSha256={query.data.sourceSha256}
			/>
		</div>
	) : (
		<ScorecardEvidence record={query.data} />
	);
}

export { SavedOutput, savedOutputInitialMode } from "./saved-attempt-output";
export { SessionAssessmentSummary } from "./session-evidence";
export { default as ScorecardEvidence } from "./stage-evidence";
export { AttemptEvidence, readSavedRecord, savedRecordQuery };
