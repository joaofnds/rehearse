import { Link } from "@tanstack/react-router";

import recordedInstant from "#benchmark/recorded-instant";
import attemptLabel from "#client/attempt-label";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";
import SavedStateSummary from "#client/saved-state-summary";
import StateBadge from "#client/system/components/state-badge";
import TableShell from "#client/system/components/table-shell";
import withinCase from "#client/within-case";

import type { ListedCase } from "./case-card";

type Member = NonNullable<ListedCase["cohorts"]>[number]["members"][number];

function memberName(member: Member, rows: RunListingResponse["rows"]): string {
	for (const row of rows) {
		if (row.kind === "group" && member.label.startsWith(`${row.groupId} · `)) {
			const rep = row.repAttempts.find(
				({ repId }) => member.label === `${row.groupId} · ${repId}`,
			);
			if (row.shortId !== undefined && rep !== undefined) {
				return `${withinCase(row.shortId, row.caseId)} · ${attemptLabel(rep.attempt)}`;
			}
		}
		if (
			row.kind === "run" &&
			member.href === `/runs/${encodeURIComponent(row.run)}?view=results` &&
			row.shortId !== undefined
		) {
			return withinCase(row.shortId, row.caseId);
		}
		if (
			row.kind === "session-attempt" &&
			member.href ===
				`/attempts/session/${encodeURIComponent(row.caseId)}/${encodeURIComponent(row.uuid)}` &&
			row.shortId !== undefined
		) {
			return withinCase(row.shortId, row.caseId);
		}
	}
	return member.label;
}

function savedTime(time: string | null): React.JSX.Element | string {
	const instant = time === null ? undefined : recordedInstant(time);
	return instant === undefined ? (
		"Not recorded"
	) : (
		<time dateTime={new Date(instant).toISOString()} title={time ?? undefined}>
			{new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(instant)}
		</time>
	);
}

interface AssessmentProps {
	readonly passed: boolean | undefined;
}

function Assessment({ passed }: AssessmentProps): React.JSX.Element {
	if (passed === undefined) {
		return <StateBadge tone="neutral">Unassessed</StateBadge>;
	}
	return (
		<StateBadge tone={passed ? "positive" : "negative"}>
			{passed ? "Passed" : "Failed"}
		</StateBadge>
	);
}

interface MemberAssessmentProps {
	readonly member: Member;
	readonly kind: ListedCase["kind"];
}

function MemberAssessment({
	member,
	kind,
}: MemberAssessmentProps): React.JSX.Element {
	if (kind !== "session") {
		return <Assessment passed={member.run.passed} />;
	}
	const { run } = member;
	const reading = recordedOutcomeReading(run);
	return (
		<span className="flex flex-col items-start gap-2">
			<span className="text-12">{reading.recorded}</span>
			<span className="text-12 text-muted-foreground">
				{run.replyChecks === undefined
					? "Reply/transcript counts unavailable"
					: `Reply/transcript: ${String(run.replyChecks.passed)} of ${String(run.replyChecks.total)} passed`}
			</span>
			<SavedStateSummary
				assessment={run.savedState}
				recordedPassed={reading.recordedPassed}
			/>
		</span>
	);
}

interface CohortMembersProps {
	readonly cohort: NonNullable<ListedCase["cohorts"]>[number];
	readonly kind: ListedCase["kind"];
	readonly rows: RunListingResponse["rows"];
}

function CohortMembers({
	cohort,
	kind,
	rows,
}: CohortMembersProps): React.JSX.Element {
	return (
		<div id="case-members" className="overflow-x-auto text-14">
			<TableShell
				caption="Runs in the selected cohort"
				columns={[
					"Run / attempt",
					"Recorded date",
					"Assessment",
					"Reported cost",
				]}
				numeric={["Reported cost"]}
				rows={cohort.members.map((member) => [
					<Link
						key="run"
						to={member.href}
						title={member.label}
						className="font-mono text-14 text-link hover:underline"
					>
						{memberName(member, rows)}
					</Link>,
					savedTime(member.startedAt),
					<MemberAssessment key="assessment" member={member} kind={kind} />,
					member.run.costUsd === undefined
						? "Unavailable"
						: spendReading(member.run.costUsd),
				])}
			/>
		</div>
	);
}

interface RecordedOutcomeReading {
	readonly recorded: string;
	readonly recordedPassed: boolean | undefined;
}

function recordedOutcomeReading(run: Member["run"]): RecordedOutcomeReading {
	let recordedPassed = run.passed;
	let recorded = "Recorded outcome unavailable";
	if (run.recordedOutcome !== undefined) {
		recorded = `Recorded ${run.recordedOutcome.toLowerCase().replaceAll("_", " ")}`;
		recordedPassed = undefined;
		if (
			run.recordedOutcome === "SUCCESSFUL" ||
			run.recordedOutcome === "UNSUCCESSFUL"
		) {
			recordedPassed = run.recordedOutcome === "SUCCESSFUL";
		}
	} else if (run.passed !== undefined) {
		recorded = `Reply/transcript ${run.passed ? "passed" : "failed"}`;
	}
	return { recorded, recordedPassed };
}

export { CohortMembers as default };
