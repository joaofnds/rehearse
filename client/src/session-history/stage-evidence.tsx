import type { AttemptEvidenceResponse } from "./attempt-evidence-query";
import { SavedOutput, savedOutputInitialMode } from "./saved-attempt-output";
import ScorecardAssessment from "./scorecard-assessment";

type StageEvidence = Extract<AttemptEvidenceResponse, { kind: "stage" }>;

type StepAssessment = StageEvidence["assessment"];

function outputTitle(output: StageEvidence["output"]): string {
	if (output.state !== "available") {
		return "Saved output";
	}
	switch (output.kind) {
		case "artifact": {
			return output.path ?? "Saved artifact";
		}
		case "reply": {
			return "Saved completion reply";
		}
		case "diff": {
			return "Saved delivery diff";
		}
		default: {
			return output.kind satisfies never;
		}
	}
}

interface ScorecardEvidenceProps {
	readonly record: StageEvidence;
}

function ScorecardEvidence({
	record,
}: ScorecardEvidenceProps): React.JSX.Element {
	return (
		<div className="grid items-start gap-4 lg:grid-cols-2">
			<div className="flex min-w-0 flex-col gap-3">
				<SavedOutput
					title={outputTitle(record.output)}
					initialMode={savedOutputInitialMode(record.output)}
					text={
						record.output.state === "available" ? record.output.text : undefined
					}
					note={
						record.output.state === "unavailable"
							? record.output.reason
							: "Saved worker output supplied to the step Judge."
					}
				/>
				{record.diff === undefined ? null : (
					<details className="rounded-lg border border-divider bg-card p-6 text-14">
						<summary>Saved delivery diff</summary>
						<pre className="mt-3 overflow-auto font-mono leading-transcript text-13 whitespace-pre-wrap wrap-break-word">
							{record.diff}
						</pre>
					</details>
				)}
				{record.completionReply === undefined ? null : (
					<details className="rounded-lg border border-divider bg-card p-6 text-14">
						<summary>Saved completion reply</summary>
						<pre className="mt-3 overflow-auto font-mono leading-transcript text-13 whitespace-pre-wrap wrap-break-word">
							{record.completionReply}
						</pre>
					</details>
				)}
			</div>
			<ScorecardAssessment grade={record.assessment} />
		</div>
	);
}

export { ScorecardEvidence as default };
export type { StageEvidence, StepAssessment };
