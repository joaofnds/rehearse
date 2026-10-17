import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Immutable } from "#benchmark/contracts";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
	DialogClose,
	DialogDescription,
} from "#client/system/ui/dialog";
import { Button } from "#client/system/ui/button";
import { RecordedText } from "#client/system/components/recorded-text";
import type { RecordedTextMode } from "#client/system/components/recorded-text";
import { Metric } from "#client/system/components/metric";
import { StateBadge } from "#client/system/components/state-badge";
import { SummaryPanel } from "#client/system/components/summary-panel";
import { attemptEvidenceQuery } from "./attempt-evidence-query";
import type { AttemptEvidenceResponse } from "./attempt-evidence-query";

type StageEvidence = Extract<AttemptEvidenceResponse, { kind: "stage" }>;
type SessionEvidenceRecord = Extract<
	AttemptEvidenceResponse,
	{ kind: "session" }
>["record"];
type StepAssessment = StageEvidence["assessment"];
type EvidenceCitation =
	StepAssessment["requirements"][number]["evidence"][number];

export async function readSavedRecord(id: string): Promise<string> {
	const response = await fetch(`/api/records/${encodeURIComponent(id)}`);
	if (!response.ok) {
		throw new Error(`Saved record unavailable (${String(response.status)})`);
	}
	return response.text();
}

interface SavedRecordQuery {
	readonly queryKey: readonly ["saved-record-json", string];
	readonly queryFn: () => Promise<string>;
}
export function savedRecordQuery(id: string): SavedRecordQuery {
	return {
		queryKey: ["saved-record-json", id],
		queryFn: () => readSavedRecord(id),
	};
}

function Citations({
	evidence,
}: {
	readonly evidence: readonly EvidenceCitation[] | undefined;
}): React.JSX.Element {
	return (
		<>
			{evidence?.map((citation, index) => (
				<div
					key={`${citation.path}:${String(index)}`}
					className="mt-2 border-l-2 border-divider pl-3 text-12"
				>
					<p>{citation.claim}</p>
					<p className="mt-1 font-mono text-12 text-dim">
						{citation.source} · {citation.path} ·{" "}
						{citation.place ?? "Location not saved"}
					</p>
					{citation.quote === undefined ? null : (
						<blockquote className="mt-2 whitespace-pre-wrap">
							{citation.quote}
						</blockquote>
					)}
				</div>
			))}
		</>
	);
}
export function savedOutputInitialMode(
	output: StageEvidence["output"] | undefined,
): RecordedTextMode {
	return output?.state === "available" && output.kind === "diff"
		? "Raw"
		: "Formatted";
}

export function SavedOutput({
	title,
	text,
	note,
	pending = false,
	initialMode = "Formatted",
	emptyMessage = "Output unavailable in this saved record.",
}: {
	readonly title: string;
	readonly text: string | undefined;
	readonly note?: string | undefined;
	readonly pending?: boolean;
	readonly initialMode?: RecordedTextMode;
	readonly emptyMessage?: string;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<section
			aria-label={title}
			className="min-w-0 rounded-lg border border-divider bg-card p-6"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-16 font-semibold">{title}</h2>
				{text === undefined ? null : (
					<Dialog open={open} onOpenChange={setOpen}>
						<DialogTrigger asChild>
							<Button size="sm" variant="quiet">
								Open complete output
							</Button>
						</DialogTrigger>
						<DialogContent width="wide">
							<div className="p-4">
								<DialogTitle>{title} · complete saved output</DialogTitle>
								<DialogDescription>
									Complete output preserved by the saved record.
								</DialogDescription>
							</div>
							<pre className="max-h-160 overflow-auto font-mono leading-transcript text-13 whitespace-pre-wrap wrap-break-word">
								{text}
							</pre>
							<div className="p-4">
								<DialogClose asChild>
									<Button size="sm" variant="quiet">
										Close
									</Button>
								</DialogClose>
							</div>
						</DialogContent>
					</Dialog>
				)}
			</div>
			{note === undefined ? null : (
				<p className="mt-2 text-12 text-dim">{note}</p>
			)}
			{pending ? (
				<p className="mt-3 text-14 text-dim">Reading saved output…</p>
			) : null}
			{text === undefined && !pending ? (
				<p className="mt-3 text-14 text-attention">{emptyMessage}</p>
			) : null}
			{text === undefined ? null : (
				<div className="mt-3 max-h-100 overflow-auto">
					<RecordedText
						key={initialMode}
						text={text}
						initialMode={initialMode}
					/>
				</div>
			)}
		</section>
	);
}

interface SessionCheckReading {
	readonly label: string;
	readonly status: "PASS" | "FAIL";
	readonly detail: string;
}

function SessionChecks({
	title,
	checks,
	emptyMessage,
}: {
	readonly title: string;
	readonly checks: readonly SessionCheckReading[];
	readonly emptyMessage: string;
}): React.JSX.Element {
	const failed = checks.filter(({ status }) => status === "FAIL");
	const passed = checks.filter(({ status }) => status === "PASS");
	const result = (
		check: SessionCheckReading,
		index: number,
	): React.JSX.Element => (
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

	return (
		<section className="mt-4" aria-label={title}>
			<h3 className="text-14 font-medium">{title}</h3>
			{checks.length === 0 ? (
				<p className="mt-3 text-14 text-attention">{emptyMessage}</p>
			) : null}
			{failed.length === 0 ? null : (
				<ul aria-label={title} className="mt-3 space-y-3">
					{failed.map((check, index) => result(check, index))}
				</ul>
			)}
			{passed.length === 0 ? null : (
				<details className="mt-3">
					<summary className="cursor-pointer text-14 text-muted-foreground">
						{title}: {passed.length} passed
					</summary>
					<ul
						aria-label={`Passed ${title.toLowerCase()}`}
						className="mt-3 space-y-3"
					>
						{passed.map((check, index) => result(check, index))}
					</ul>
				</details>
			)}
		</section>
	);
}

function SessionEvidence({
	record,
}: {
	readonly record: Immutable<SessionEvidenceRecord>;
}): React.JSX.Element {
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
				{record.stateResults === undefined ? null : (
					<SessionChecks
						title="Saved state checks"
						checks={record.stateResults.map(({ name, status, detail }) => ({
							label: name,
							status,
							detail,
						}))}
						emptyMessage="No saved state check outcomes were recorded."
					/>
				)}
				<SessionChecks
					title="Reply/transcript checks"
					checks={record.checks.map(({ kind, status, detail }) => ({
						label: kind,
						status,
						detail,
					}))}
					emptyMessage="No check outcomes were recorded. This is not a failed check."
				/>
			</SummaryPanel>
		</div>
	);
}

export function SessionAssessmentSummary({
	record,
}: {
	readonly record: Immutable<SessionEvidenceRecord>;
}): React.JSX.Element {
	const replyPassed = record.checks.filter(
		({ status }) => status === "PASS",
	).length;
	const statePassed = record.stateResults?.filter(
		({ status }) => status === "PASS",
	).length;
	const stateFailed =
		record.stateResults?.filter(({ status }) => status === "FAIL").length ?? 0;
	const successfulStateAssessment =
		statePassed !== undefined &&
		statePassed > 0 &&
		stateFailed === 0 &&
		record.stateGradingError === undefined;

	return (
		<div>
			<StateBadge
				tone={record.outcome === "SUCCESSFUL" ? "neutral" : "attention"}
			>
				Recorded outcome: {record.outcome}
			</StateBadge>
			<dl className="mt-3 flex flex-wrap gap-6">
				<Metric
					label="Reply/transcript checks"
					value={
						record.checks.length === 0
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
			{record.outcome === "SUCCESSFUL" && stateFailed > 0 ? (
				<p className="mt-3 text-14 font-medium">
					Recorded success and saved state checks disagree: {stateFailed} saved
					state {stateFailed === 1 ? "check failed" : "checks failed"}.
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
		</div>
	);
}

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
export function ScorecardEvidence({
	record,
}: {
	readonly record: StageEvidence;
}): React.JSX.Element {
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
function ScorecardAssessment({
	grade,
}: {
	readonly grade: Immutable<StepAssessment>;
}): React.JSX.Element {
	const criteria = [
		...grade.hardBlockers.map((item) => ({
			id: item.id,
			status: item.status,
			evidence: item.evidence,
			section: "Hard blocker",
		})),
		...grade.requirements.map((item) => ({
			id: item.id,
			status: item.status,
			evidence: item.evidence,
			section: "Requirement",
		})),
	];
	const clearBlockers = criteria.filter(
		({ section, status }) => section === "Hard blocker" && status === "PASS",
	);
	const criterion = (
		item: Readonly<(typeof criteria)[number]>,
	): React.JSX.Element => (
		<li
			key={`${item.section}:${item.id}`}
			className="border-t border-subtle pt-3"
		>
			<h3 className="text-14 font-medium">
				{item.status} · {item.section} · {item.id}
			</h3>
			<Citations evidence={item.evidence} />
		</li>
	);

	return (
		<section className="min-w-0 rounded-lg border border-divider bg-card p-6">
			<h2 className="text-16 font-semibold">Step Judge assessment</h2>
			<p className="mt-2 font-mono text-14">
				Grade {grade.grade} · {grade.verdict}
			</p>
			<p className="mt-2 text-14">
				{grade.summary ?? "The saved grade has no written summary."}
			</p>
			{grade.detailed ? null : (
				<p className="mt-3 text-14 text-dim">
					This older record retains a summary grade only; detailed criteria and
					citations were not saved.
				</p>
			)}
			<ul className="mt-4 flex flex-col gap-4">
				{criteria
					.filter(
						({ section, status }) =>
							section !== "Hard blocker" || status !== "PASS",
					)
					.toSorted(
						(left, right) =>
							Number(right.status === "FAIL") - Number(left.status === "FAIL"),
					)
					.map((item) => criterion(item))}
				{grade.dimensions.map((item) => (
					<li
						key={`dimension:${item.id}`}
						className="border-t border-subtle pt-3"
					>
						<h3 className="text-14 font-medium">
							{item.grade} · {item.id}
						</h3>
						<Citations evidence={item.evidence} />
					</li>
				))}
			</ul>
			{clearBlockers.length === 0 ? null : (
				<details className="mt-4">
					<summary className="cursor-pointer text-14 text-muted-foreground">
						{clearBlockers.length} clear{" "}
						{clearBlockers.length === 1 ? "blocker" : "blockers"} &amp;
						citations
					</summary>
					<ul className="mt-3 space-y-3">
						{clearBlockers.map((item) => criterion(item))}
					</ul>
				</details>
			)}
		</section>
	);
}

export function AttemptEvidence({
	id,
}: {
	readonly id: string;
}): React.JSX.Element {
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
		<SessionEvidence record={query.data.record} />
	) : (
		<ScorecardEvidence record={query.data} />
	);
}
