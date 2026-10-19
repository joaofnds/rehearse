import type { Immutable } from "#benchmark/contracts";

import { EMPTY_COLLECTION_LENGTH, SINGLE_ITEM_COUNT } from "./session-evidence";
import type { StepAssessment } from "./stage-evidence";

type EvidenceCitation =
	StepAssessment["requirements"][number]["evidence"][number];

interface CitationsProps {
	readonly evidence: readonly EvidenceCitation[] | undefined;
}

function Citations({ evidence }: CitationsProps): React.JSX.Element {
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

interface ScorecardCriterion {
	readonly id: string;
	readonly status: StepAssessment["requirements"][number]["status"];
	readonly evidence: readonly Immutable<EvidenceCitation>[] | undefined;
	readonly section: string;
}

function scorecardCriterion(item: ScorecardCriterion): React.JSX.Element {
	return (
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
}

interface ScorecardAssessmentProps {
	readonly grade: Immutable<StepAssessment>;
}

function ScorecardAssessment({
	grade,
}: ScorecardAssessmentProps): React.JSX.Element {
	const criteria = [
		...grade.hardBlockers.map((item) => ({
			evidence: item.evidence,
			id: item.id,
			section: "Hard blocker",
			status: item.status,
		})),
		...grade.requirements.map((item) => ({
			evidence: item.evidence,
			id: item.id,
			section: "Requirement",
			status: item.status,
		})),
	];
	const clearBlockers = criteria.filter(
		({ section, status }) => section === "Hard blocker" && status === "PASS",
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
			<ScorecardCriteriaList grade={grade} criteria={criteria} />
			{clearBlockers.length === EMPTY_COLLECTION_LENGTH ? null : (
				<ClearBlockerCitations clearBlockers={clearBlockers} />
			)}
		</section>
	);
}

interface ScorecardCriteriaListProps {
	readonly grade: Immutable<StepAssessment>;
	readonly criteria: readonly ScorecardCriterion[];
}

function ScorecardCriteriaList({
	grade,
	criteria,
}: ScorecardCriteriaListProps): React.JSX.Element {
	return (
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
				.map((item) => scorecardCriterion(item))}
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
	);
}

interface ClearBlockerCitationsProps {
	readonly clearBlockers: readonly ScorecardCriterion[];
}

function ClearBlockerCitations({
	clearBlockers,
}: ClearBlockerCitationsProps): React.JSX.Element {
	return (
		<details className="mt-4">
			<summary className="cursor-pointer text-14 text-muted-foreground">
				{clearBlockers.length} clear{" "}
				{clearBlockers.length === SINGLE_ITEM_COUNT ? "blocker" : "blockers"}{" "}
				&amp; citations
			</summary>
			<ul className="mt-3 space-y-3">
				{clearBlockers.map((item) => scorecardCriterion(item))}
			</ul>
		</details>
	);
}

export { ScorecardAssessment as default };
