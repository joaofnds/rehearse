import { useId } from "react";

import type { CaseKind } from "./case-declaration-draft";

const DEFAULT_FIELD_ROWS = 3;

const FIELD_CLASS =
	"w-full min-w-0 rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-14";

interface FieldProps {
	readonly label: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly multiline?: boolean;
	readonly rows?: number;
	readonly hint?: string;
}

function Field({
	label,
	value,
	onChange,
	multiline = false,
	rows = DEFAULT_FIELD_ROWS,
	hint,
}: FieldProps): React.JSX.Element {
	const id = useId();
	const hintId = useId();

	return (
		<>
			<dt className="text-muted-foreground">
				<label htmlFor={id}>{label}</label>
			</dt>
			<dd className="sm:col-span-3 flex min-w-0 flex-col gap-1">
				{multiline ? (
					<textarea
						id={id}
						value={value}
						rows={rows}
						aria-describedby={hint === undefined ? undefined : hintId}
						onChange={(event) => {
							onChange(event.target.value);
						}}
						className={FIELD_CLASS}
					/>
				) : (
					<input
						id={id}
						value={value}
						aria-describedby={hint === undefined ? undefined : hintId}
						onChange={(event) => {
							onChange(event.target.value);
						}}
						className={FIELD_CLASS}
					/>
				)}
				{hint === undefined ? null : (
					<span id={hintId} className="text-12 text-dim">
						{hint}
					</span>
				)}
			</dd>
		</>
	);
}

const NO_PIPELINE_SOURCE_REASON =
	"A pipeline case starts from another pipeline case's steps and judges, and none is declared. Import a workflow in Cases → Workflows first.";

interface KindChoiceProps {
	readonly kind: CaseKind;
	readonly pipelineAvailable: boolean;
	readonly onChange: (kind: CaseKind) => void;
}

function KindChoice({
	kind,
	pipelineAvailable,
	onChange,
}: KindChoiceProps): React.JSX.Element {
	const reasonId = useId();

	return (
		<>
			<dt className="text-muted-foreground">Kind</dt>
			<dd
				role="radiogroup"
				aria-label="Kind"
				className="sm:col-span-3 flex flex-col gap-1"
			>
				<span className="flex gap-4 text-14">
					<label className="flex items-center gap-1.5">
						<input
							type="radio"
							name="kind"
							value="session"
							checked={kind === "session"}
							onChange={() => {
								onChange("session");
							}}
						/>
						Session
					</label>
					<PipelineKindChoice
						kind={kind}
						pipelineAvailable={pipelineAvailable}
						onChange={onChange}
						reasonId={reasonId}
					/>
				</span>
				{pipelineAvailable ? null : (
					<span id={reasonId} className="text-12 text-dim">
						{NO_PIPELINE_SOURCE_REASON}
					</span>
				)}
			</dd>
		</>
	);
}

interface PipelineKindChoiceProps {
	readonly kind: CaseKind;
	readonly pipelineAvailable: boolean;
	readonly onChange: KindChoiceProps["onChange"];
	readonly reasonId: string;
}

function PipelineKindChoice({
	kind,
	pipelineAvailable,
	onChange,
	reasonId,
}: PipelineKindChoiceProps): React.JSX.Element {
	return (
		<label
			className={
				pipelineAvailable
					? "flex items-center gap-1.5"
					: "flex items-center gap-1.5 text-dim"
			}
		>
			<input
				type="radio"
				name="kind"
				value="pipeline"
				checked={kind === "pipeline"}
				disabled={!pipelineAvailable}
				aria-describedby={pipelineAvailable ? undefined : reasonId}
				onChange={() => {
					onChange("pipeline");
				}}
			/>
			Pipeline
		</label>
	);
}

export { Field, FIELD_CLASS, KindChoice };
