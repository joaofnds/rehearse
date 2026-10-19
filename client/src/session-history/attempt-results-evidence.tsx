import type { Immutable } from "#benchmark/contracts";
import CurrentLink from "#client/system/components/current-link";

import { AttemptEvidence } from "./attempt-evidence";
import { stageReading } from "./attempt-measurements";
import { attemptPath, recordId } from "./attempt-record-identity";
import type { ConfirmationRepResult } from "./confirmation-rep-query";
import GroupFinalAssessment from "./group-final-assessment";
import type { SessionHistoryIdentity } from "./session-history-page";

const INITIAL_RECORDED_STAGE_INDEX = 0;

interface SelectedRepEvidenceProps {
	readonly selected:
		| Immutable<ConfirmationRepResult["stages"][number]>
		| undefined;
	readonly identity: Extract<SessionHistoryIdentity, { kind: "confirmation" }>;
}

function SelectedRepEvidence({
	selected,
	identity,
}: SelectedRepEvidenceProps): React.JSX.Element {
	if (selected === undefined) {
		return <p className="text-14 text-dim">No step outcome was saved.</p>;
	}
	if (selected.status === "JUDGED") {
		return (
			<AttemptEvidence
				id={`rep:stage:${identity.groupId}/${identity.repId}/${selected.stage}`}
			/>
		);
	}
	return (
		<p className="text-14 text-dim">
			{selected.stage}: {stageReading(selected)}. No judged assessment is
			available.
		</p>
	);
}

interface RepEvidenceProps {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "confirmation" }>;
	readonly record: Immutable<ConfirmationRepResult>;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}

function RepEvidence({
	identity,
	record,
	step,
	comparison,
}: RepEvidenceProps): React.JSX.Element {
	const selected =
		step === undefined
			? record.stages[INITIAL_RECORDED_STAGE_INDEX]
			: record.stages.find((item) => item.stage === step);
	if (record.mode === "session") {
		return <AttemptEvidence id={recordId(identity)} />;
	}
	return (
		<>
			<nav aria-label="Rep steps" className="flex flex-wrap gap-3 text-14">
				{record.stages.map((item) => (
					<CurrentLink
						key={item.stage}
						to={attemptPath(identity)}
						search={{
							step: item.stage,
							view: "results",
							...(comparison !== undefined && { comparison }),
						}}
						marksCurrent={selected?.stage === item.stage}
						className="rounded-md border border-transparent px-3 py-2 text-link underline current:border-primary current:bg-selected current:text-pale current:no-underline"
					>
						{item.stage}
					</CurrentLink>
				))}
			</nav>
			<SelectedRepEvidence selected={selected} identity={identity} />
			{record.mode === "pipeline" ? (
				<GroupFinalAssessment
					groupId={identity.groupId}
					repId={identity.repId}
				/>
			) : null}
		</>
	);
}

interface ResultsEvidenceProps {
	readonly identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>;
	readonly record: Immutable<ConfirmationRepResult> | undefined;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}

function ResultsEvidence({
	identity,
	record,
	step,
	comparison,
}: ResultsEvidenceProps): React.JSX.Element | null {
	const id = recordId(identity);
	if (identity.kind === "standalone") {
		return <AttemptEvidence id={id} />;
	}
	if (identity.kind === "replay") {
		return <AttemptEvidence id={id} />;
	}
	if (record === undefined) {
		return null;
	}
	return (
		<RepEvidence
			identity={identity}
			record={record}
			step={step}
			comparison={comparison}
		/>
	);
}

export { ResultsEvidence as default };
