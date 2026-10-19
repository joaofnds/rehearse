import EvidenceDialogLink from "#client/evidence/evidence-dialog";
import StateBadge from "#client/system/components/state-badge";

import type { FinalAssessmentResponse } from "./investigation-query";
import type {
	FinalOutcome,
	OutcomeReading,
	TaskGradeCardProps,
} from "./task-grade-card";

const EMPTY_COLLECTION_LENGTH = 0;

const JUDGE_SCOPE =
	"The task judge sees only what went in at step 1 and what came out of the last step. It does not read the intermediate steps, so it cannot grade a run that stopped early. Step grades below are unaffected.";

type FinalCriterion = Extract<
	FinalAssessmentResponse,
	{ state: "available" }
>["requirements"][number];

interface TaskCriterionProps {
	readonly item: FinalCriterion;
	readonly run: string;
}

function TaskCriterion({ item, run }: TaskCriterionProps): React.JSX.Element {
	return (
		<li
			key={item.id}
			className="min-w-0 rounded-md border border-divider p-3 text-14 wrap-anywhere"
		>
			<p className="font-medium">
				{item.status} · {item.id}
			</p>
			{item.evidence.map((evidence, index) => (
				<div key={index} className="mt-2">
					<p>{evidence.claim}</p>
					{evidence.quote === undefined ? null : (
						<blockquote className="mt-2 border-l-2 border-accent-line pl-3 font-mono text-13 leading-transcript whitespace-pre-wrap wrap-anywhere">
							{evidence.quote}
						</blockquote>
					)}
					<EvidenceDialogLink
						identity={{
							index: String(index),
							item: item.id,
							kind: "final",
							run,
						}}
					>
						<span className="mt-1 inline-block text-12 text-link underline">
							{evidence.place ?? `${evidence.path} · open cited source`}
						</span>
					</EvidenceDialogLink>
				</div>
			))}
		</li>
	);
}

interface FinalAssessmentReading {
	readonly assessment: FinalAssessmentResponse | undefined;
	readonly assessmentError: boolean;
	readonly assessmentLoading: boolean;
}

function finalCriteriaMessage({
	assessment,
	assessmentError,
	assessmentLoading,
}: FinalAssessmentReading): string {
	let missingCriteria = "No final criteria were recorded.";
	if (assessmentError) {
		missingCriteria = "Could not read the saved final criteria.";
	} else if (assessment?.state === "unavailable") {
		missingCriteria = assessment.reason;
	} else if (assessmentLoading) {
		missingCriteria = "Reading saved final criteria…";
	}

	return missingCriteria;
}

interface FailedFinalCriteriaProps {
	readonly run: string;
	readonly criteria: readonly FinalCriterion[];
	readonly failed: readonly FinalCriterion[];
	readonly firstFinding: string | undefined;
	readonly criteriaOpen: boolean;
	readonly onCriteriaOpenChange: TaskGradeCardProps["onCriteriaOpenChange"];
}

function FailedFinalCriteria({
	run,
	criteria,
	failed,
	firstFinding,
	criteriaOpen,
	onCriteriaOpenChange,
}: FailedFinalCriteriaProps): React.JSX.Element {
	return (
		<>
			<p className="mt-2 text-14">
				{failed.length} of {criteria.length} final criteria failed ·{" "}
				{failed.map(({ id }) => id).join(", ")}
			</p>
			{firstFinding === undefined ? null : (
				<p className="mt-2 text-14 text-secondary-foreground">{firstFinding}</p>
			)}
			<details
				id="final-criteria"
				tabIndex={-1}
				className="mt-3"
				open={criteriaOpen}
				onToggle={(event) => {
					onCriteriaOpenChange(event.currentTarget.open);
				}}
			>
				<summary className="cursor-pointer text-14 text-pale">
					All {failed.length} failed criteria &amp; citations
				</summary>
				<ul aria-label="Failed final criteria" className="mt-3 grid gap-2">
					{failed.map((item) => (
						<TaskCriterion key={item.id} item={item} run={run} />
					))}
				</ul>
			</details>
		</>
	);
}

interface FinalGradingContextProps {
	readonly assessment: FinalAssessmentResponse | undefined;
	readonly passed: readonly FinalCriterion[];
	readonly outcome: FinalOutcome;
	readonly criteria: readonly FinalCriterion[];
	readonly missingCriteria: string;
	readonly run: string;
}

function FinalGradingContext({
	assessment,
	passed,
	outcome,
	criteria,
	missingCriteria,
	run,
}: FinalGradingContextProps): React.JSX.Element {
	return (
		<div className="mt-4 grid items-start gap-2 border-t border-divider pt-3 lg:grid-cols-3">
			{assessment?.state === "available" && assessment.summary !== undefined ? (
				<details className="rounded-md bg-muted px-3 py-1 open:col-span-full">
					<summary className="cursor-pointer text-14 text-muted-foreground">
						Full saved final Judge summary
					</summary>
					<p className="mt-2 text-14 leading-reading text-secondary-foreground">
						{assessment.summary}
					</p>
				</details>
			) : null}
			{passed.length === EMPTY_COLLECTION_LENGTH ? null : (
				<details className="rounded-md bg-muted px-3 py-1 open:col-span-full">
					<summary className="cursor-pointer text-14 text-muted-foreground">
						{passed.length} passed final criteria
					</summary>
					<ul className="mt-2 grid gap-2">
						{passed.map((item) => (
							<TaskCriterion key={item.id} item={item} run={run} />
						))}
					</ul>
				</details>
			)}
			{outcome.status === "JUDGED" &&
			criteria.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="mt-2 text-14 text-attention">{missingCriteria}</p>
			) : null}
			<details className="rounded-md bg-muted px-3 py-1 open:col-span-full">
				<summary className="cursor-pointer text-14 text-muted-foreground">
					How final grading works
				</summary>
				<p className="mt-2 mb-3 max-w-prose text-14 leading-reading text-secondary-foreground">
					{JUDGE_SCOPE}
				</p>
			</details>
		</div>
	);
}

const FIRST_FAILED_CRITERION_INDEX = 0;

const FIRST_FAILURE_EVIDENCE_INDEX = 0;

interface FinalCriteriaReading {
	readonly criteria: readonly FinalCriterion[];
	readonly failed: readonly FinalCriterion[];
	readonly passed: readonly FinalCriterion[];
	readonly firstFinding: string | undefined;
	readonly missingCriteria: string;
}

function finalCriteriaReading(
	request: FinalAssessmentReading,
): FinalCriteriaReading {
	const { assessment } = request;
	const criteria =
		assessment?.state === "available" ? assessment.requirements : [];
	const failed = criteria.filter(({ status }) => status === "FAIL");
	const passed = criteria.filter(({ status }) => status === "PASS");
	const firstFinding =
		failed[FIRST_FAILED_CRITERION_INDEX]?.evidence[FIRST_FAILURE_EVIDENCE_INDEX]
			?.claim;

	return {
		criteria,
		failed,
		firstFinding,
		missingCriteria: finalCriteriaMessage(request),
		passed,
	};
}

interface FinalAssessmentReadingsProps {
	readonly request: TaskGradeCardProps;
	readonly reading: OutcomeReading;
}

function FinalAssessmentReadings({
	request,
	reading,
}: FinalAssessmentReadingsProps): React.JSX.Element {
	const criteria = finalCriteriaReading(request);
	return (
		<div>
			<div className="mt-2 flex flex-wrap items-baseline gap-3">
				<StateBadge tone={outcomeTone(reading.value)}>
					{reading.value}
				</StateBadge>
				<p className="text-12 text-dim">{reading.note}</p>
			</div>
			{criteria.failed.length === EMPTY_COLLECTION_LENGTH ? null : (
				<FailedFinalCriteria
					run={request.row.run}
					criteria={criteria.criteria}
					failed={criteria.failed}
					firstFinding={criteria.firstFinding}
					criteriaOpen={request.criteriaOpen}
					onCriteriaOpenChange={request.onCriteriaOpenChange}
				/>
			)}
			<FinalGradingContext
				assessment={request.assessment}
				passed={criteria.passed}
				outcome={request.outcome}
				criteria={criteria.criteria}
				missingCriteria={criteria.missingCriteria}
				run={request.row.run}
			/>
		</div>
	);
}

function outcomeTone(value: string): "negative" | "positive" | "neutral" {
	if (value === "FAIL") {
		return "negative";
	}

	return value === "PASS" ? "positive" : "neutral";
}

export { FinalAssessmentReadings as default };
