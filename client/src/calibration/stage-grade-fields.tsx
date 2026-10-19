import { STAGE_LETTER_GRADES } from "#benchmark/stage-letter-grades";
import RadioChoice from "#client/system/components/radio-choice";

import type { Criteria, Draft, PassFail } from "./stage-review-draft";
import { PASS_FAIL, dimensionHints } from "./stage-review-draft";

interface ChoicesProps<Value extends string> {
	readonly id: string;
	readonly description: string | undefined;
	readonly hints: readonly string[];
	readonly values: readonly Value[];
	readonly chosen: Value | undefined;
	readonly onChoose: (value: Value) => void;
}

function Choices<Value extends string>({
	id,
	description,
	hints,
	values,
	chosen,
	onChoose,
}: ChoicesProps<Value>): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1.5 border-b border-subtle py-2.5">
			<p aria-hidden="true" className="font-mono text-12">
				{id}
			</p>
			{description === undefined ? null : (
				<p className="text-14 text-muted-foreground">{description}</p>
			)}
			{hints.map((hint) => (
				<p key={hint} className="text-14 text-muted-foreground">
					{hint}
				</p>
			))}
			<div role="radiogroup" aria-label={id} className="flex flex-wrap gap-3">
				{values.map((value) => (
					<RadioChoice
						key={value}
						name={id}
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
		</div>
	);
}

interface GradeCriteriaProps {
	readonly criteria: Criteria;
	readonly draft: Draft;
	readonly setDraft: (draft: Draft) => void;
	readonly chooseStatus: (id: string, status: PassFail) => void;
}

function GradeCriteria({
	criteria,
	draft,
	setDraft,
	chooseStatus,
}: GradeCriteriaProps): React.JSX.Element {
	return (
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
	);
}

interface GradeNoteProps {
	readonly noteId: string;
	readonly draft: Draft;
	readonly setDraft: (draft: Draft) => void;
}

function GradeNote({
	noteId,
	draft,
	setDraft,
}: GradeNoteProps): React.JSX.Element {
	return (
		<>
			<label htmlFor={noteId} className="text-12">
				Where you differed (optional)
			</label>
			<textarea
				id={noteId}
				value={draft.note}
				onChange={(event) => {
					setDraft({ ...draft, note: event.target.value });
				}}
				className="min-h-20 rounded-lg border border-strong bg-raised px-3 py-2 text-14"
			/>
		</>
	);
}

export { GradeCriteria, GradeNote };
