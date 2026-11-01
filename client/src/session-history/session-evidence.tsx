import type { Immutable } from "#benchmark/contracts";
import Metric from "#client/system/components/metric";
import StateBadge from "#client/system/components/state-badge";
import SummaryPanel from "#client/system/components/summary-panel";

import type { AttemptEvidenceResponse } from "./attempt-evidence-query";
import { SavedOutput } from "./saved-attempt-output";
import SessionJudgeEvidence from "./session-judge-evidence";

const NO_PASSED_STATE_CHECKS = 0;

const NO_FAILED_STATE_CHECKS = 0;

const SINGLE_ITEM_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

type SessionEvidenceRecord = Extract<
	AttemptEvidenceResponse,
	{ kind: "session" }
>["record"];

interface SessionCheckReading {
	readonly label: string;
	readonly status: "PASS" | "FAIL";
	readonly detail: string;
}

function sessionCheckResult(
	check: SessionCheckReading,
	index: number,
): React.JSX.Element {
	return (
		<li
			key={`${check.label}:${String(index)}`}
			className="border-t border-subtle pt-3 text-14"
		>
			<p className="font-medium">
				{check.status} · {check.label}
			</p>
			<p className="mt-1">{check.detail}</p>
		</li>
	);
}

interface SessionChecksProps {
	readonly title: string;
	readonly checks: readonly SessionCheckReading[];
	readonly emptyMessage: string;
}

function SessionChecks({
	title,
	checks,
	emptyMessage,
}: SessionChecksProps): React.JSX.Element {
	const failed = checks.filter(({ status }) => status === "FAIL");
	const passed = checks.filter(({ status }) => status === "PASS");

	return (
		<section className="mt-4" aria-label={title}>
			<h3 className="text-14 font-medium">{title}</h3>
			{checks.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="mt-3 text-14 text-attention">{emptyMessage}</p>
			) : null}
			{failed.length === EMPTY_COLLECTION_LENGTH ? null : (
				<ul aria-label={title} className="mt-3 space-y-3">
					{failed.map((check, index) => sessionCheckResult(check, index))}
				</ul>
			)}
			{passed.length === EMPTY_COLLECTION_LENGTH ? null : (
				<details className="mt-3">
					<summary className="cursor-pointer text-14 text-muted-foreground">
						{title}: {passed.length} passed
					</summary>
					<ul
						aria-label={`Passed ${title.toLowerCase()}`}
						className="mt-3 space-y-3"
					>
						{passed.map((check, index) => sessionCheckResult(check, index))}
					</ul>
				</details>
			)}
		</section>
	);
}

interface SessionEvidenceProps {
	readonly record: Immutable<SessionEvidenceRecord>;
}

function SessionEvidence({ record }: SessionEvidenceProps): React.JSX.Element {
	return (
		<div className="grid items-start gap-4 lg:grid-cols-2">
			<SavedOutput
				title="Saved reply"
				text={record.reply}
				note={
					record.outcome === "NO_REPLY"
						? "The execution recorded no reply; no reply checks were evaluated."
						: record.error
				}
			/>
			<SummaryPanel title="Session assessment">
				<SessionAssessmentSummary record={record} />
				<SessionJudgeEvidence judge={record.judge} />
				{record.stateResults === undefined ? null : (
					<SessionChecks
						title="Saved state checks"
						checks={record.stateResults.map(({ name, status, detail }) => ({
							detail,
							label: name,
							status,
						}))}
						emptyMessage="No saved state check outcomes were recorded."
					/>
				)}
				<SessionChecks
					title="Reply/transcript checks"
					checks={record.checks.map(({ kind, status, detail }) => ({
						detail,
						label: kind,
						status,
					}))}
					emptyMessage="No check outcomes were recorded. This is not a failed check."
				/>
			</SummaryPanel>
		</div>
	);
}

interface SessionAssessmentSummaryProps {
	readonly record: Immutable<SessionEvidenceRecord>;
}

function SessionAssessmentSummary({
	record,
}: SessionAssessmentSummaryProps): React.JSX.Element {
	const replyPassed = record.checks.filter(
		({ status }) => status === "PASS",
	).length;
	const statePassed = record.stateResults?.filter(
		({ status }) => status === "PASS",
	).length;
	const stateFailed =
		record.stateResults?.filter(({ status }) => status === "FAIL").length ??
		EMPTY_COLLECTION_LENGTH;
	const successfulStateAssessment =
		statePassed !== undefined &&
		statePassed > NO_PASSED_STATE_CHECKS &&
		stateFailed === NO_FAILED_STATE_CHECKS &&
		record.stateGradingError === undefined;

	return (
		<div>
			<StateBadge
				tone={record.outcome === "SUCCESSFUL" ? "neutral" : "attention"}
			>
				Recorded outcome: {record.outcome}
			</StateBadge>
			<SessionAssessmentCounts
				record={record}
				replyPassed={replyPassed}
				statePassed={statePassed}
			/>
			<SessionStateQualifications
				record={record}
				stateFailed={stateFailed}
				successfulStateAssessment={successfulStateAssessment}
			/>
		</div>
	);
}

interface SessionStateQualificationsProps {
	readonly record: Immutable<SessionEvidenceRecord>;
	readonly stateFailed: number;
	readonly successfulStateAssessment: boolean;
}

function SessionStateQualifications({
	record,
	stateFailed,
	successfulStateAssessment,
}: SessionStateQualificationsProps): React.JSX.Element {
	return (
		<>
			{record.outcome === "SUCCESSFUL" &&
			stateFailed > NO_FAILED_STATE_CHECKS ? (
				<p className="mt-3 text-14 font-medium">
					Recorded success and saved state checks disagree: {stateFailed} saved
					state{" "}
					{stateFailed === SINGLE_ITEM_COUNT ? "check failed" : "checks failed"}
					.
				</p>
			) : null}
			{record.outcome === "UNSUCCESSFUL" && successfulStateAssessment ? (
				<p className="mt-3 text-14 font-medium">
					Recorded unsuccessful outcome and saved state checks differ: all saved
					state checks passed.
				</p>
			) : null}
			{record.stateGradingError === undefined ? null : (
				<p className="mt-3 text-14">
					State checks unavailable: {record.stateGradingError}
				</p>
			)}
			<p className="mt-2 text-12 text-dim">
				The recorded outcome uses reply/transcript checks. Saved state checks
				are a separate assessment; this view preserves both.
			</p>
		</>
	);
}

interface SessionAssessmentCountsProps {
	readonly record: Immutable<SessionEvidenceRecord>;
	readonly replyPassed: number;
	readonly statePassed: number | undefined;
}

function SessionAssessmentCounts({
	record,
	replyPassed,
	statePassed,
}: SessionAssessmentCountsProps): React.JSX.Element {
	return (
		<dl className="mt-3 flex flex-wrap gap-6">
			<Metric
				label="Reply/transcript checks"
				value={
					record.checks.length === EMPTY_COLLECTION_LENGTH
						? "No reply/transcript check outcomes recorded"
						: `${String(replyPassed)} of ${String(record.checks.length)} reply/transcript checks passed`
				}
			/>
			<Metric
				label="Saved state checks"
				value={
					record.stateResults === undefined
						? "Unavailable in this record"
						: `${String(statePassed)} of ${String(record.stateResults.length)} saved state checks passed`
				}
			/>
		</dl>
	);
}

export {
	EMPTY_COLLECTION_LENGTH,
	SessionAssessmentSummary,
	SessionEvidence,
	SINGLE_ITEM_COUNT,
};
