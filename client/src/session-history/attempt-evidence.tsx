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
					<p className="mt-1 font-mono text-11-5 text-dim">
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
export function SavedOutput({
	title,
	text,
	note,
	pending = false,
	emptyMessage = "Output unavailable in this saved record.",
}: {
	readonly title: string;
	readonly text: string | undefined;
	readonly note?: string | undefined;
	readonly pending?: boolean;
	readonly emptyMessage?: string;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<section
			aria-label={title}
			className="min-w-0 rounded-lg border border-divider bg-card p-4"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-14 font-medium">{title}</h2>
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
							<pre className="max-h-160 overflow-auto font-mono text-12 whitespace-pre-wrap wrap-break-word">
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
				<p className="mt-3 text-13 text-dim">Reading saved output…</p>
			) : null}
			{text === undefined && !pending ? (
				<p className="mt-3 text-13 text-dim">{emptyMessage}</p>
			) : null}
			{text === undefined ? null : (
				<pre className="mt-3 max-h-80 overflow-auto font-mono text-12 whitespace-pre-wrap wrap-break-word">
					{text === "" ? "(Saved output is empty.)" : text}
				</pre>
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
			<section className="min-w-0 rounded-lg border border-divider bg-card p-4">
				<h2 className="text-14 font-medium">Deterministic checks</h2>
				{record.checks.length === 0 ? (
					<p className="mt-3 text-13 text-dim">
						No check outcomes were recorded. This is not a failed check.
					</p>
				) : (
					<ul className="mt-3 flex flex-col gap-3">
						{record.checks
							.toSorted(
								(left, right) =>
									Number(right.status === "FAIL") -
									Number(left.status === "FAIL"),
							)
							.map((check, index) => (
								<li
									key={`${check.kind}:${String(index)}`}
									className="border-t border-subtle pt-3 text-13"
								>
									<p className="font-medium">
										{check.status} · {check.kind}
									</p>
									<p className="mt-1">{check.detail}</p>
								</li>
							))}
					</ul>
				)}
				{record.stateResults === undefined ? null : (
					<>
						<h3 className="mt-4 text-13 font-medium">Saved state checks</h3>
						<ul>
							{record.stateResults.map((check) => (
								<li key={check.name} className="mt-3 text-13">
									<p>
										{check.status} · {check.name}
									</p>
									<p>{check.detail}</p>
								</li>
							))}
						</ul>
					</>
				)}
				{record.stateGradingError === undefined ? null : (
					<p className="mt-4 text-13">
						State checks unavailable: {record.stateGradingError}
					</p>
				)}
			</section>
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
					<details className="rounded-lg border border-divider bg-card p-4 text-13">
						<summary>Saved delivery diff</summary>
						<pre className="mt-3 overflow-auto font-mono text-12 whitespace-pre-wrap wrap-break-word">
							{record.diff}
						</pre>
					</details>
				)}
				{record.completionReply === undefined ? null : (
					<details className="rounded-lg border border-divider bg-card p-4 text-13">
						<summary>Saved completion reply</summary>
						<pre className="mt-3 overflow-auto font-mono text-12 whitespace-pre-wrap wrap-break-word">
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
	return (
		<section className="min-w-0 rounded-lg border border-divider bg-card p-4">
			<h2 className="text-14 font-medium">Step Judge assessment</h2>
			<p className="mt-2 font-mono text-13">
				Grade {grade.grade} · {grade.verdict}
			</p>
			<p className="mt-2 text-13">
				{grade.summary ?? "The saved grade has no written summary."}
			</p>
			{grade.detailed ? null : (
				<p className="mt-3 text-13 text-dim">
					This older record retains a summary grade only; detailed criteria and
					citations were not saved.
				</p>
			)}
			<ul className="mt-4 flex flex-col gap-4">
				{criteria
					.toSorted(
						(left, right) =>
							Number(right.status === "FAIL") - Number(left.status === "FAIL"),
					)
					.map((item) => (
						<li
							key={`${item.section}:${item.id}`}
							className="border-t border-subtle pt-3"
						>
							<h3 className="text-13 font-medium">
								{item.status} · {item.section} · {item.id}
							</h3>
							<Citations evidence={item.evidence} />
						</li>
					))}
				{grade.dimensions.map((item) => (
					<li
						key={`dimension:${item.id}`}
						className="border-t border-subtle pt-3"
					>
						<h3 className="text-13 font-medium">
							{item.grade} · {item.id}
						</h3>
						<Citations evidence={item.evidence} />
					</li>
				))}
			</ul>
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
			<p className="text-13 text-dim">Reading saved output and assessment…</p>
		);
	}
	if (query.isError || query.data === undefined) {
		return (
			<p className="text-13 text-dim">
				Detailed output and assessment unavailable. This record may retain only
				a summary; inspect the recorded outcome above.
			</p>
		);
	}
	if (query.data.state === "unavailable") {
		return <p className="text-13 text-dim">{query.data.reason}</p>;
	}
	return query.data.kind === "session" ? (
		<SessionEvidence record={query.data.record} />
	) : (
		<ScorecardEvidence record={query.data} />
	);
}
