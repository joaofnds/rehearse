import { useId, useState } from "react";

import type { GradedStageRef } from "#benchmark/operator-grade";
import SectionLabel from "#client/system/components/section-label";
import { Button } from "#client/system/ui/button";

import { GradeCriteria, GradeNote } from "./stage-grade-fields";
import type { Criteria, Draft, PassFail } from "./stage-review-draft";
import { EMPTY_DRAFT, completeGrade } from "./stage-review-draft";
import useRecordGrade from "./use-record-grade";

interface GradeFormProps {
	readonly stage: GradedStageRef;
	readonly criteria: Criteria;
}

function GradeForm({ stage, criteria }: GradeFormProps): React.JSX.Element {
	const noteId = useId();
	const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
	const grade = completeGrade(criteria, draft);
	const record = useRecordGrade(stage);

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
			<GradeCriteria
				criteria={criteria}
				draft={draft}
				setDraft={setDraft}
				chooseStatus={chooseStatus}
			/>

			<GradeNote noteId={noteId} draft={draft} setDraft={setDraft} />
			{record.isError ? (
				<p role="alert" className="text-14 text-attention">
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

export { GradeForm as default };
