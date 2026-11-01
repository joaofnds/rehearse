import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import type { SessionReview } from "#benchmark/session-review";
import RadioChoice from "#client/system/components/radio-choice";
import { Button } from "#client/system/ui/button";

import { recordReview, sessionReviewQuery } from "./session-review-query";
import type { SessionReviewReading } from "./session-review-query";

const EMPTY_COUNT = 0;
interface ReadingProps {
	readonly id: string;
	readonly reading: Readonly<SessionReviewReading>;
}
interface ChoicesProps {
	readonly name: string;
	readonly chosen: string | undefined;
	readonly onChoose: (value: "PASS" | "FAIL") => void;
}
function Choices({ name, chosen, onChoose }: ChoicesProps): React.JSX.Element {
	return (
		<div role="radiogroup" aria-label={name} className="flex flex-wrap gap-3">
			{(["PASS", "FAIL"] as const).map((value) => (
				<RadioChoice
					key={value}
					name={name}
					value={value}
					checked={chosen === value}
					onChoose={() => {
						onChoose(value);
					}}
				>
					{value}
				</RadioChoice>
			))}
		</div>
	);
}

interface FieldsProps {
	readonly reading: Readonly<SessionReviewReading>;
	readonly verdict: "PASS" | "FAIL" | undefined;
	readonly setVerdict: (value: "PASS" | "FAIL") => void;
	readonly statuses: ReadonlyMap<string, "PASS" | "FAIL">;
	readonly choose: (id: string, value: "PASS" | "FAIL") => void;
}
function ReviewFields({
	reading,
	verdict,
	setVerdict,
	statuses,
	choose,
}: FieldsProps): React.JSX.Element {
	return (
		<>
			<p className="text-14 text-muted-foreground">
				Record your own assessment of the saved attempt. This review is
				nonblind: checks and Judge results are already visible. One review can
				be saved per attempt.
			</p>
			{reading.rubric === undefined ? null : (
				<details>
					<summary className="cursor-pointer text-14">
						Saved review rubric
					</summary>
					<pre className="mt-2 overflow-auto whitespace-pre-wrap text-13">
						{reading.rubric}
					</pre>
				</details>
			)}
			{reading.requirements.length === EMPTY_COUNT ? (
				<Choices name="Human verdict" chosen={verdict} onChoose={setVerdict} />
			) : (
				reading.requirements.map((requirement) => (
					<fieldset key={requirement} className="flex flex-col gap-2">
						<legend className="text-14">{requirement}</legend>
						<Choices
							name={requirement}
							chosen={statuses.get(requirement)}
							onChoose={(value) => {
								choose(requirement, value);
							}}
						/>
					</fieldset>
				))
			)}
		</>
	);
}

interface ReviewDraft {
	readonly summaryId: string;
	readonly summary: string;
	readonly setSummary: (value: string) => void;
	readonly verdict: "PASS" | "FAIL" | undefined;
	readonly setVerdict: (value: "PASS" | "FAIL") => void;
	readonly statuses: ReadonlyMap<string, "PASS" | "FAIL">;
	readonly choose: (id: string, value: "PASS" | "FAIL") => void;
	readonly complete: boolean;
	readonly pending: boolean;
	readonly error: string | undefined;
	readonly submit: () => void;
}
interface ReviewSubmission {
	readonly complete: boolean;
	readonly grade: "PASS" | "FAIL" | undefined;
	readonly requirements: SessionReview["requirements"];
}
interface SubmissionDraft {
	readonly statuses: ReadonlyMap<string, "PASS" | "FAIL">;
	readonly verdict: "PASS" | "FAIL" | undefined;
	readonly summary: string;
}
function reviewSubmission(
	ids: readonly string[],
	{ statuses, verdict, summary }: SubmissionDraft,
): ReviewSubmission {
	const requirements = ids.flatMap((requirement) => {
		const status = statuses.get(requirement);
		return status === undefined ? [] : [{ id: requirement, status }];
	});
	let grade = verdict;
	if (ids.length > EMPTY_COUNT) {
		grade = requirements.every(({ status }) => status === "PASS")
			? "PASS"
			: "FAIL";
	}

	const complete =
		grade !== undefined &&
		summary.trim() !== "" &&
		requirements.length === ids.length;
	return { complete, grade, requirements };
}

function useReviewDraft({ id, reading }: ReadingProps): ReviewDraft {
	const queryClient = useQueryClient();
	const [summary, setSummary] = useState("");
	const [verdict, setVerdict] = useState<"PASS" | "FAIL">();
	const [statuses, setStatuses] = useState<
		ReadonlyMap<string, "PASS" | "FAIL">
	>(new Map());
	const mutation = useMutation({
		mutationFn: async (review: SessionReview) => await recordReview(id, review),
		onSuccess: (result) => {
			queryClient.setQueryData(sessionReviewQuery(id).queryKey, result);
		},
	});
	const { complete, grade, requirements } = reviewSubmission(
		reading.requirements,
		{ statuses, summary, verdict },
	);

	return {
		choose: (requirement, value) => {
			setStatuses(new Map([...statuses, [requirement, value]]));
		},
		complete,
		error: mutation.isError ? mutation.error.message : undefined,
		pending: mutation.isPending,
		setSummary,
		setVerdict,
		statuses,
		submit: () => {
			if (complete && grade !== undefined) {
				mutation.mutate({
					requirements,
					sourceSha256: reading.sourceSha256,
					summary,
					verdict: grade,
				});
			}
		},
		summary,
		summaryId: useId(),
		verdict,
	};
}

function ReviewForm({ id, reading }: ReadingProps): React.JSX.Element {
	const draft = useReviewDraft({ id, reading });
	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				draft.submit();
			}}
		>
			<ReviewFields
				reading={reading}
				verdict={draft.verdict}
				setVerdict={draft.setVerdict}
				statuses={draft.statuses}
				choose={draft.choose}
			/>
			<label htmlFor={draft.summaryId} className="text-14">
				Review summary
			</label>
			<textarea
				id={draft.summaryId}
				className="min-h-20 rounded-lg border border-strong bg-raised px-3 py-2 text-14"
				value={draft.summary}
				onChange={(event) => {
					draft.setSummary(event.target.value);
				}}
				required
			/>
			{draft.error === undefined ? null : (
				<p role="alert" className="text-14 text-attention">
					{draft.error}
				</p>
			)}
			<Button type="submit" disabled={!draft.complete || draft.pending}>
				{draft.pending ? "Recording review…" : "Record human review"}
			</Button>
		</form>
	);
}

export { ReviewForm as default };
