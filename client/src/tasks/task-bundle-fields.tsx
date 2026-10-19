import { useId } from "react";

import type { BundlePreview, ImportDraft } from "./task-bundle-api";

const EMPTY_COLLECTION_LENGTH = 0;

const FIELD_CLASS =
	"w-full min-w-0 rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-14";

interface ImportFieldProps {
	readonly label: string;
	readonly value: string;
	readonly hint?: string;
	readonly onChange: (value: string) => void;
}

function ImportField({
	label,
	value,
	hint,
	onChange,
}: ImportFieldProps): React.JSX.Element {
	const id = useId();
	const hintId = useId();

	return (
		<div className="flex flex-col gap-1 text-14">
			<label htmlFor={id} className="text-muted-foreground">
				{label}
			</label>
			<input
				id={id}
				value={value}
				aria-describedby={hint === undefined ? undefined : hintId}
				onChange={(event) => {
					onChange(event.target.value);
				}}
				className={FIELD_CLASS}
			/>
			{hint === undefined ? null : (
				<span id={hintId} className="text-12 text-dim">
					{hint}
				</span>
			)}
		</div>
	);
}

interface PreviewSummaryProps {
	readonly preview: BundlePreview;
}

function PreviewSummary({ preview }: PreviewSummaryProps): React.JSX.Element {
	return (
		<section
			aria-label="What the bundle holds"
			className="flex min-w-0 flex-col gap-2 rounded-md border border-strong px-3 py-2 text-14 wrap-anywhere"
		>
			<p>
				<span className="font-mono">{preview.caseId}</span> · {preview.title}
			</p>
			<p className="font-mono text-12">
				{preview.steps.map(({ name }) => name).join(" → ")} ·{" "}
				{preview.stepJudges} step judges + 1 final judge
				{preview.model === null ? "" : ` · ${preview.model}`}
			</p>
			<div>
				<p className="text-muted-foreground">
					Each run of it runs these commands in its target:
				</p>
				<ul className="mt-1 flex flex-col gap-0.5 font-mono text-12">
					{preview.commands.map((command) => (
						<li key={command}>{command}</li>
					))}
				</ul>
			</div>
			{preview.services.length > EMPTY_COLLECTION_LENGTH && (
				<div>
					<p className="text-muted-foreground">
						It starts these containers, whose variables reach those commands and
						its agent sessions:
					</p>
					<ul className="mt-1 flex flex-col gap-0.5 font-mono text-12">
						{preview.services.map(({ name, image, exports }) => (
							<li key={name}>
								{name} from {image}, setting {exports.join(", ")}
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

interface ImportDestinationProps {
	readonly preview: BundlePreview;
	readonly draft: ImportDraft;
	readonly edit: (change: Partial<ImportDraft>) => void;
}

function ImportDestination({
	preview,
	draft,
	edit,
}: ImportDestinationProps): React.JSX.Element {
	return (
		<>
			<PreviewSummary preview={preview} />
			<ImportField
				label="Id"
				hint="The new case's directory under cases/"
				value={draft.id}
				onChange={(id) => {
					edit({ id });
				}}
			/>
			<ImportField
				label="Title"
				value={draft.title}
				onChange={(title) => {
					edit({ title });
				}}
			/>
			<ImportField
				label="Target repository"
				hint="A git repository root on this machine, absolute or relative to the case directory"
				value={draft.targetPath}
				onChange={(targetPath) => {
					edit({ targetPath });
				}}
			/>
		</>
	);
}

export { ImportDestination as default };
