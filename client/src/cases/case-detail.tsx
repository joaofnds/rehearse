import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { recordedInstant } from "#benchmark/recorded-instant";
import { comparisonIndexQuery } from "#client/comparison/comparison-index-query";
import { Metric } from "#client/system/components/metric";
import { StateBadge } from "#client/system/components/state-badge";
import { SummaryPanel } from "#client/system/components/summary-panel";
import { TableShell } from "#client/system/components/table-shell";
import { RecordedText } from "#client/system/components/recorded-text";
import { plural } from "#client/plural";
import { Disclosure } from "#client/system/components/disclosure";
import { runListingQuery } from "#client/run-history/run-history-query";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { withinCase } from "#client/within-case";
import { attemptLabel } from "#client/attempt-label";
import { SavedStateSummary } from "#client/saved-state-summary";
import type { ListedCase } from "./case-card";

type Definition = NonNullable<ListedCase["definition"]>;
type TextReading = Definition["prompt"];
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

function DefinitionReading({
	reading,
	code = false,
}: {
	readonly reading: TextReading | undefined;
	readonly code?: boolean;
}): React.JSX.Element {
	if (reading === undefined) {
		return (
			<p className="text-14 text-muted-foreground">
				Definition content is unavailable from this listing.
			</p>
		);
	}
	return (
		<>
			<p className="mb-3 font-mono text-12 text-dim">{reading.source}</p>
			{reading.state === "available" ? (
				<div className="max-h-120 overflow-auto">
					{code ? (
						<pre className="whitespace-pre-wrap break-words font-mono leading-transcript text-13">
							{reading.text}
						</pre>
					) : (
						<RecordedText text={reading.text} />
					)}
				</div>
			) : (
				<p className="text-14 text-muted-foreground">{reading.reason}</p>
			)}
		</>
	);
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

function RelatedComparisons({
	caseId,
}: {
	readonly caseId: string;
}): React.JSX.Element {
	const query = useQuery(comparisonIndexQuery);
	const related = (query.data?.comparisons ?? []).filter((entry) =>
		entry.caseIds.includes(caseId),
	);
	return (
		<SummaryPanel
			title="Related comparisons"
			description="Saved comparisons keep their own corpus pair and conditions. They are not combined with this cohort."
		>
			{query.isLoading ? (
				<p className="text-14 text-muted-foreground">Loading comparisons…</p>
			) : null}
			{query.isError ? (
				<p role="alert" className="text-14 text-attention">
					Comparisons could not be loaded.
				</p>
			) : null}
			{query.isSuccess && related.length === 0 ? (
				<p className="text-14 text-muted-foreground">
					No saved comparison names this case.
				</p>
			) : null}
			<ul className="flex flex-col gap-3">
				{related.map((entry) => (
					<li key={entry.digest}>
						<Link
							to="/comparisons/$digest"
							params={{ digest: entry.digest }}
							className="text-14 text-link hover:underline"
						>
							{caseId} · {entry.mode} comparison{" "}
							<span className="font-mono text-12">
								{entry.digest.slice(0, 12)}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</SummaryPanel>
	);
}

export function CaseDetail({
	listed,
	corpusVersion,
}: {
	readonly listed: ListedCase;
	readonly corpusVersion: string | undefined;
}): React.JSX.Element {
	const { definition } = listed;
	return (
		<div className="flex flex-col gap-6">
			<SummaryPanel
				title="Case definition"
				description={
					listed.kind === "session"
						? "A session case supplies one prompt and evaluates the reply, transcript and any declared saved-state checks."
						: "A workflow case supplies a task and product brief, then evaluates its steps and final output."
				}
			>
				<dl className="grid gap-5 sm:grid-cols-3">
					<Metric label="Model" value={listed.model ?? "Not declared"} />
					<Metric
						label="Session budget"
						value={
							definition?.sessionBudgetUsd === undefined ||
							definition.sessionBudgetUsd === null
								? "Not declared"
								: `$${definition.sessionBudgetUsd.toFixed(2)}`
						}
						hint="Per session; the launch ceiling applies separately."
					/>
					<Metric
						label="Definition"
						value={
							<span className="font-mono text-12">
								cases/{listed.id}/case.json
							</span>
						}
					/>
				</dl>
				{definition?.corpusFiles === undefined ? null : (
					<div className="mt-4">
						<Disclosure
							collapsedLabel={`Declared corpus files (${String(definition.corpusFiles.length)})`}
							expandedLabel="Hide declared corpus files"
						>
							{definition.corpusFiles.length === 0 ? (
								<p className="text-14 text-muted-foreground">
									No corpus files declared.
								</p>
							) : (
								<ul
									aria-label="Declared corpus files"
									className="mt-2 max-h-80 w-full overflow-auto font-mono text-12"
								>
									{definition.corpusFiles.map((path) => (
										<li key={path} className="py-1 wrap-anywhere">
											{path}
										</li>
									))}
								</ul>
							)}
						</Disclosure>
						<p className="mt-2 text-12 text-muted-foreground">
							Declared inclusion does not prove an instruction was read.
						</p>
					</div>
				)}
				{definition?.tools === undefined ? null : (
					<p className="mt-2 text-14 text-muted-foreground">
						Allowed tools:{" "}
						{definition.tools.length === 0
							? "None"
							: definition.tools.join(", ")}
					</p>
				)}
			</SummaryPanel>
			<div className="grid min-w-0 gap-6 xl:grid-cols-2">
				<SummaryPanel
					title={listed.kind === "session" ? "Prompt" : "Task prompt"}
				>
					<DefinitionReading reading={definition?.prompt} />
				</SummaryPanel>
				<SummaryPanel
					title="Evaluation contract"
					description={
						listed.kind === "session"
							? "Reply/transcript checks and the saved-state check are separate assessment layers."
							: "Final rubric; step rubrics are listed in the workflow definition."
					}
				>
					<DefinitionReading
						reading={definition?.evaluation}
						code={listed.kind === "session"}
					/>
				</SummaryPanel>
			</div>
			{definition?.productBrief === undefined ? null : (
				<SummaryPanel title="Product brief">
					<DefinitionReading reading={definition.productBrief} />
				</SummaryPanel>
			)}
			<CaseCohorts listed={listed} corpusVersion={corpusVersion} />
			<RelatedComparisons caseId={listed.id} />
		</div>
	);
}

function CaseCohorts({
	listed,
	corpusVersion,
}: {
	readonly listed: ListedCase;
	readonly corpusVersion: string | undefined;
}): React.JSX.Element {
	const navigate = useNavigate();
	const listing = useQuery(runListingQuery);
	const cohorts = listed.cohorts ?? [];
	const defaultCorpus =
		listed.figures.state === "measured"
			? (listed.figures.corpusVersion ?? "unrecorded")
			: undefined;
	const selectedKey = corpusVersion ?? defaultCorpus;
	const cohort = cohorts.find(
		(entry) => (entry.corpusVersion ?? "unrecorded") === selectedKey,
	);
	const figures = cohort?.figures;
	return (
		<div id="case-evidence" className="scroll-mt-6">
			<SummaryPanel
				title="Run evidence by corpus"
				description="One cohort at a time. Whole-case runs and individual attempts from finished groups count; step replays and stage-only groups are excluded."
			>
				{cohorts.length === 0 ? (
					<p className="text-14 text-muted-foreground">
						{listed.figures.state === "no-runs"
							? "No runs have been recorded for this case."
							: "Cohort member evidence is unavailable from this listing."}
					</p>
				) : (
					<>
						<label className="flex flex-wrap items-center gap-3 text-14">
							Corpus cohort
							<select
								aria-label="Corpus cohort"
								value={selectedKey ?? ""}
								onChange={(event) => {
									void navigate({
										to: "/cases",
										search: {
											caseId: listed.id,
											corpusVersion: event.target.value,
										},
										hash: "case-evidence",
									});
								}}
								className="max-w-full rounded-md border border-strong bg-background px-3 py-2 font-mono text-14"
							>
								{cohort === undefined ? (
									<option value={selectedKey}>Unknown corpus selection</option>
								) : null}
								{cohorts.map((entry) => (
									<option
										key={entry.corpusVersion ?? "unrecorded"}
										value={entry.corpusVersion ?? "unrecorded"}
									>
										{entry.corpusVersion === null
											? "Corpus version not recorded"
											: `corpus@${entry.corpusVersion}`}{" "}
										· {plural(entry.members.length, "run")}
									</option>
								))}
							</select>
						</label>
						{cohort === undefined ? (
							<p role="status" className="mt-4 text-14 text-muted-foreground">
								No recorded cohort matches this corpus selection. Choose a
								recorded version.
							</p>
						) : null}
						{figures?.state === "measured" ? (
							<>
								<dl className="my-5 grid gap-5 sm:grid-cols-3">
									<Metric
										label="Runs in this cohort"
										value={
											<a
												href="#case-members"
												className="text-link hover:underline"
											>
												{figures.counted}
											</a>
										}
										hint={`${plural(cohorts.reduce((sum, entry) => sum + entry.members.length, 0) - figures.counted, "run")} in other cohorts`}
									/>
									<Metric
										label={
											listed.kind === "session"
												? "Reply/transcript checks passed"
												: "Final Judge passed"
										}
										value={
											<a
												href="#case-members"
												className="text-link hover:underline"
											>
												{figures.passed} / {figures.judged} assessed
											</a>
										}
										hint={`${String(figures.counted - figures.judged)} unassessed of ${plural(figures.counted, "run")}`}
									/>
									<Metric
										label="Mean reported cost per run"
										value={
											<a
												href="#case-members"
												className="text-link hover:underline"
											>
												{figures.costPerRun.meanUsd === null
													? "Unavailable"
													: `$${figures.costPerRun.meanUsd.toFixed(2)}`}
											</a>
										}
										hint={`${String(figures.costPerRun.costed)} costed; ${String(figures.costPerRun.lacking)} without a complete cost`}
									/>
								</dl>
								{listed.kind === "session" ? (
									<p className="mb-4 text-14 text-muted-foreground">
										Pass figures use recorded reply/transcript checks. Open an
										attempt to inspect saved-state checks and any disagreement.
									</p>
								) : null}
							</>
						) : null}
						{cohort === undefined ? null : (
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
											{memberName(member, listing.data?.rows ?? [])}
										</Link>,
										savedTime(member.startedAt),
										<MemberAssessment
											key="assessment"
											member={member}
											kind={listed.kind}
										/>,
										member.run.costUsd === undefined
											? "Unavailable"
											: `$${member.run.costUsd.toFixed(2)}`,
									])}
								/>
							</div>
						)}
					</>
				)}
			</SummaryPanel>
		</div>
	);
}

function Assessment({
	passed,
}: {
	readonly passed: boolean | undefined;
}): React.JSX.Element {
	if (passed === undefined) {
		return <StateBadge tone="neutral">Unassessed</StateBadge>;
	}
	return (
		<StateBadge tone={passed ? "positive" : "negative"}>
			{passed ? "Passed" : "Failed"}
		</StateBadge>
	);
}

function MemberAssessment({
	member,
	kind,
}: {
	readonly member: Member;
	readonly kind: ListedCase["kind"];
}): React.JSX.Element {
	if (kind !== "session") {
		return <Assessment passed={member.run.passed} />;
	}
	const { run } = member;
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
	return (
		<span className="flex flex-col items-start gap-2">
			<span className="text-12">{recorded}</span>
			<span className="text-12 text-muted-foreground">
				{run.replyChecks === undefined
					? "Reply/transcript counts unavailable"
					: `Reply/transcript: ${String(run.replyChecks.passed)} of ${String(run.replyChecks.total)} passed`}
			</span>
			<SavedStateSummary
				assessment={run.savedState}
				recordedPassed={recordedPassed}
			/>
		</span>
	);
}
