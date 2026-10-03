import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { StageLetterGrade } from "#benchmark/contracts";
import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";
import { STAGE_LETTER_GRADES } from "#benchmark/stage-letter-grades";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { TableShell } from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import { stepLabel } from "./calibration-figures";
import { calibrationQuery } from "./calibration-query";
import type { GradeRecorded, StageReview } from "./stage-review-query";
import { recordGrade, stageReviewQuery } from "./stage-review-query";

type PassFail = "PASS" | "FAIL";

const PASS_FAIL: readonly PassFail[] = ["PASS", "FAIL"];

const COMPARISON_COLUMNS = ["Criterion", "You", "Judge"] as const;

interface Draft {
	readonly statuses: Readonly<Record<string, PassFail>>;
	readonly letters: Readonly<Record<string, StageLetterGrade>>;
	readonly note: string;
}

const EMPTY_DRAFT: Draft = { statuses: {}, letters: {}, note: "" };

type Criteria = StageReview["criteria"];

/** The grade the draft makes, or nothing while any criterion is ungraded. */
function completeGrade(
	criteria: Criteria,
	draft: Draft,
): OperatorGrade | undefined {
	const hardBlockers = criteria.hardBlockers.flatMap(({ id }) => {
		const status = draft.statuses[id];
		return status === undefined ? [] : [{ id, status }];
	});
	const requirements = criteria.requirements.flatMap(({ id }) => {
		const status = draft.statuses[id];
		return status === undefined ? [] : [{ id, status }];
	});
	const dimensions = criteria.dimensions.flatMap(({ id }) => {
		const grade = draft.letters[id];
		return grade === undefined ? [] : [{ id, grade }];
	});
	const graded =
		hardBlockers.length === criteria.hardBlockers.length &&
		requirements.length === criteria.requirements.length &&
		dimensions.length === criteria.dimensions.length;
	if (!graded) {
		return undefined;
	}

	const note = draft.note.trim();

	return {
		hardBlockers,
		requirements,
		dimensions,
		note: note === "" ? undefined : note,
	};
}

function InputRead({
	input,
}: {
	readonly input: StageReview["input"];
}): React.JSX.Element {
	const headingId = useId();

	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<h2 id={headingId}>
				<SectionLabel>What the judge read</SectionLabel>
			</h2>
			{Object.entries(input).map(([field, text]) => (
				<div key={field}>
					<p className="font-mono text-11-5 text-dim">{field}</p>
					<pre className="mt-1 max-h-80 overflow-auto rounded-lg border border-subtle bg-raised px-3 py-2 text-12 whitespace-pre-wrap">
						{text}
					</pre>
				</div>
			))}
		</section>
	);
}

function Choices<Value extends string>({
	id,
	description,
	hints,
	values,
	chosen,
	onChoose,
}: {
	readonly id: string;
	readonly description: string | undefined;
	readonly hints: readonly string[];
	readonly values: readonly Value[];
	readonly chosen: Value | undefined;
	readonly onChoose: (value: Value) => void;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1.5 border-b border-subtle py-2.5">
			<p aria-hidden="true" className="font-mono text-12">
				{id}
			</p>
			{description === undefined ? null : (
				<p className="text-12 text-muted-foreground">{description}</p>
			)}
			{hints.map((hint) => (
				<p key={hint} className="text-11-5 text-dim">
					{hint}
				</p>
			))}
			<div role="radiogroup" aria-label={id} className="flex flex-wrap gap-3">
				{values.map((value) => (
					<label
						key={value}
						className="inline-flex min-h-11 items-center gap-1.5 font-mono text-12"
					>
						<input
							type="radio"
							name={id}
							value={value}
							checked={chosen === value}
							onChange={() => {
								onChoose(value);
							}}
						/>
						{value}
					</label>
				))}
			</div>
		</div>
	);
}

function dimensionHints(
	dimension: Criteria["dimensions"][number],
): readonly string[] {
	return [dimension.good, dimension.excellent].filter(
		(hint): hint is string => hint !== undefined,
	);
}

function GradeForm({
	stage,
	criteria,
}: {
	readonly stage: GradedStageRef;
	readonly criteria: Criteria;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const noteId = useId();
	const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
	const grade = completeGrade(criteria, draft);
	const record = useMutation({
		mutationFn: (operatorGrade: OperatorGrade) =>
			recordGrade(stage, operatorGrade),
		onSuccess: async (recorded) => {
			queryClient.setQueryData(
				stageReviewQuery(stage).queryKey,
				(review: StageReview | undefined) =>
					review === undefined ? review : { ...review, ...recorded },
			);
			await queryClient.invalidateQueries({
				queryKey: calibrationQuery.queryKey,
				exact: true,
			});
		},
	});

	function chooseStatus(id: string, status: PassFail): void {
		setDraft({ ...draft, statuses: { ...draft.statuses, [id]: status } });
	}

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (grade !== undefined) {
					record.mutate(grade);
				}
			}}
		>
			<h2>
				<SectionLabel>Your grade</SectionLabel>
			</h2>
			<div>
				{[...criteria.hardBlockers, ...criteria.requirements].map(
					({ id, description }) => (
						<Choices
							key={id}
							id={id}
							description={description}
							hints={[]}
							values={PASS_FAIL}
							chosen={draft.statuses[id]}
							onChoose={(status) => {
								chooseStatus(id, status);
							}}
						/>
					),
				)}
				{criteria.dimensions.map((dimension) => (
					<Choices
						key={dimension.id}
						id={dimension.id}
						description={dimension.description}
						hints={dimensionHints(dimension)}
						values={STAGE_LETTER_GRADES}
						chosen={draft.letters[dimension.id]}
						onChoose={(letter) => {
							setDraft({
								...draft,
								letters: { ...draft.letters, [dimension.id]: letter },
							});
						}}
					/>
				))}
			</div>
			<label htmlFor={noteId} className="text-12">
				Where you differed (optional)
			</label>
			<textarea
				id={noteId}
				value={draft.note}
				onChange={(event) => {
					setDraft({ ...draft, note: event.target.value });
				}}
				className="min-h-20 rounded-lg border border-strong bg-raised px-3 py-2 text-12"
			/>
			{record.isError ? (
				<p role="alert" className="text-sm text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{record.error.message}
				</p>
			) : null}
			<div>
				<Button
					type="submit"
					size="compact"
					disabled={grade === undefined || record.isPending}
				>
					Record my grade
				</Button>
			</div>
		</form>
	);
}

function Comparison({
	criteria,
	recorded,
}: {
	readonly criteria: Criteria;
	readonly recorded: GradeRecorded;
}): React.JSX.Element {
	const { operatorGrade, judgeGrade } = recorded;
	const operatorItems = [
		...operatorGrade.hardBlockers.map(({ id, status }) => [id, status]),
		...operatorGrade.requirements.map(({ id, status }) => [id, status]),
		...operatorGrade.dimensions.map(({ id, grade }) => [id, grade]),
	];
	const judgeItems = [
		...judgeGrade.hardBlockers.map(({ id, status }) => [id, status]),
		...judgeGrade.requirements.map(({ id, status }) => [id, status]),
		...judgeGrade.dimensions.map(({ id, grade }) => [id, grade]),
	];
	const yours = new Map(operatorItems.map(([id, value]) => [id, value]));
	const judges = new Map(judgeItems.map(([id, value]) => [id, value]));
	const ids = [
		...criteria.hardBlockers,
		...criteria.requirements,
		...criteria.dimensions,
	].map(({ id }) => id);

	return (
		<section className="flex flex-col gap-3">
			<TableShell
				caption="Your grade against the judge's"
				columns={[...COMPARISON_COLUMNS]}
				rows={[
					["Step letter", operatorGrade.grade, judgeGrade.grade],
					...ids.map((id) => [id, yours.get(id) ?? "—", judges.get(id) ?? "—"]),
				].map(([criterion, you, judge]) => [
					<span key="criterion" className="font-mono text-12">
						{criterion}
					</span>,
					<span key="you" className="font-mono font-bold">
						{you}
					</span>,
					<span key="judge" className="font-mono font-bold">
						{judge}
					</span>,
				])}
			/>
			{operatorGrade.note === undefined ? null : (
				<p className="text-12 text-muted-foreground">
					Your note: {operatorGrade.note}
				</p>
			)}
			<p className="text-12 text-pretty">{judgeGrade.summary}</p>
		</section>
	);
}

function recordedGrade(review: StageReview): GradeRecorded | undefined {
	const { operatorGrade, judgeGrade } = review;
	if (operatorGrade === undefined || judgeGrade === undefined) {
		return undefined;
	}

	return { operatorGrade, judgeGrade };
}

/**
 * A judged step graded blind: the form shows only what the Judge read and the
 * criteria, and the Judge's grade appears once the operator's is recorded.
 */
export function StageReviewPage({
	stage,
}: {
	readonly stage: GradedStageRef;
}): React.JSX.Element {
	const query = useQuery(stageReviewQuery(stage));
	const review = query.data;
	const recorded = review === undefined ? undefined : recordedGrade(review);

	return (
		<div>
			<ScreenHeader
				title="Grade a judged step"
				subline={
					review === undefined
						? undefined
						: `${stepLabel(stage, review.stageName)} · ${review.judgeModel ?? "Judge model not recorded"}`
				}
				aside={
					<Button asChild size="compact" variant="ghost">
						<Link to="/calibration">Back to Judge calibration</Link>
					</Button>
				}
			/>

			<div className="px-5 pt-3.5 pb-9">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load this judged step.
					</p>
				) : null}

				{review === undefined ? null : (
					<div className="grid max-w-250 grid-cols-1 gap-4.5 lg:grid-cols-2">
						<InputRead input={review.input} />
						{recorded === undefined ? (
							<GradeForm stage={stage} criteria={review.criteria} />
						) : (
							<Comparison criteria={review.criteria} recorded={recorded} />
						)}
					</div>
				)}
			</div>
		</div>
	);
}
