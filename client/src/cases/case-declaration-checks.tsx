import { Button } from "#client/system/ui/button";
import NativeSelect from "#client/system/ui/native-select";

import type {
	CheckDraft,
	CheckField,
	Draft,
	DraftEdit,
} from "./case-declaration-draft";
import {
	CHECK_FIELDS,
	CHECK_KINDS,
	MULTILINE_FIELDS,
	NEW_CHECK,
	ORDINAL_BASE,
} from "./case-declaration-draft";
import { FIELD_CLASS } from "./case-declaration-fields";

interface CheckRowProps {
	readonly position: number;
	readonly check: CheckDraft;
	readonly onChange: (check: CheckDraft) => void;
}

function CheckRow({
	position,
	check,
	onChange,
}: CheckRowProps): React.JSX.Element {
	const name = `Check ${String(position)}`;

	return (
		<fieldset className="flex flex-col gap-1.5 rounded-md border border-strong px-3 py-2">
			<legend className="px-1 text-12 text-muted-foreground">{name}</legend>
			<label className="flex flex-col items-start gap-2 text-14 sm:flex-row sm:items-center">
				<span className="w-16 text-muted-foreground">kind</span>
				<NativeSelect
					aria-label={`${name} kind`}
					value={check.kind}
					onChange={(event) => {
						const kind = CHECK_KINDS.find(
							(choice) => choice === event.target.value,
						);
						if (kind !== undefined) {
							onChange({ fields: {}, kind });
						}
					}}
				>
					{CHECK_KINDS.map((kind) => (
						<option key={kind} value={kind}>
							{kind}
						</option>
					))}
				</NativeSelect>
			</label>
			{CHECK_FIELDS[check.kind].map((field) => {
				const value = check.fields[field] ?? "";
				const change = (next: string): void => {
					onChange({ ...check, fields: { ...check.fields, [field]: next } });
				};

				return (
					<CheckFieldInput
						key={field}
						field={field}
						name={name}
						value={value}
						change={change}
					/>
				);
			})}
		</fieldset>
	);
}

interface CheckFieldInputProps {
	readonly field: CheckField;
	readonly name: string;
	readonly value: string;
	readonly change: (next: string) => void;
}

function CheckFieldInput({
	field,
	name,
	value,
	change,
}: CheckFieldInputProps): React.JSX.Element {
	return (
		<label
			key={field}
			className="flex flex-col items-start gap-2 text-14 sm:flex-row sm:items-center"
		>
			<span className="w-16 text-muted-foreground">{field}</span>
			{MULTILINE_FIELDS.has(field) ? (
				<textarea
					aria-label={`${name} ${field}`}
					value={value}
					rows={2}
					onChange={(event) => {
						change(event.target.value);
					}}
					className={FIELD_CLASS}
				/>
			) : (
				<input
					aria-label={`${name} ${field}`}
					value={value}
					onChange={(event) => {
						change(event.target.value);
					}}
					className={FIELD_CLASS}
				/>
			)}
		</label>
	);
}

interface CheckCollectionProps {
	readonly draft: Draft;
	readonly edit: DraftEdit;
}

function CheckCollection({
	draft,
	edit,
}: CheckCollectionProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2">
			{draft.checks.map((check, index) => (
				<CheckRow
					key={index}
					position={index + ORDINAL_BASE}
					check={check}
					onChange={(changed) => {
						edit({
							checks: draft.checks.map((current, at) =>
								at === index ? changed : current,
							),
						});
					}}
				/>
			))}
			<span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => {
						edit({ checks: [...draft.checks, NEW_CHECK] });
					}}
				>
					Add a check
				</Button>
			</span>
		</div>
	);
}

export { CheckCollection as default };
