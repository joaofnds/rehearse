import { Button } from "#client/system/ui/button";
import {
	DialogClose,
	DialogDescription,
	DialogTitle,
} from "#client/system/ui/dialog";

import { EMPTY_COLLECTION_LENGTH } from "./case-declaration-draft";
import { Field, KindChoice } from "./case-declaration-fields";
import { PipelineFields, SessionFields } from "./case-declaration-inputs";
import type { CaseDeclarationModel } from "./use-case-declaration";
import useDeclarationDraft from "./use-case-declaration";

interface DeclareFormProps {
	readonly onDeclared: (path: string) => void;
}

function DeclareForm({ onDeclared }: DeclareFormProps): React.JSX.Element {
	const model = useDeclarationDraft(onDeclared);

	return (
		<form
			className="flex min-h-0 flex-col overflow-hidden"
			onSubmit={(event) => {
				event.preventDefault();
				model.submit();
			}}
		>
			<DeclarationDialogHeader />

			<DeclarationDialogContent model={model} />

			<DeclarationDialogFooter pending={model.pending} />
		</form>
	);
}

function DeclarationDialogHeader(): React.JSX.Element {
	return (
		<header className="flex items-center gap-3 border-b border-strong px-4 py-3">
			<DialogTitle>Declare a case</DialogTitle>
			<span className="ml-auto">
				<DialogClose asChild>
					<Button variant="outline" size="sm" aria-label="Close">
						Esc
					</Button>
				</DialogClose>
			</span>
		</header>
	);
}

interface DeclarationDialogFooterProps {
	readonly pending: boolean;
}

function DeclarationDialogFooter({
	pending,
}: DeclarationDialogFooterProps): React.JSX.Element {
	return (
		<footer className="flex items-center gap-2.5 border-t border-strong px-4 py-3">
			<span className="ml-auto flex gap-2">
				<DialogClose asChild>
					<Button type="button" variant="outline">
						Cancel
					</Button>
				</DialogClose>
				<Button variant="primary" type="submit" disabled={pending}>
					Declare
				</Button>
			</span>
		</footer>
	);
}

interface DeclarationIdentityFieldsProps {
	readonly model: CaseDeclarationModel;
}

function DeclarationIdentityFields({
	model,
}: DeclarationIdentityFieldsProps): React.JSX.Element {
	return (
		<dl className="grid grid-cols-1 items-center gap-x-4 gap-y-2 text-14 sm:grid-cols-4">
			<Field
				label="Id"
				value={model.draft.id}
				onChange={(id) => {
					model.edit({ id });
				}}
			/>
			<KindChoice
				kind={model.draft.kind}
				pipelineAvailable={model.sources.length > EMPTY_COLLECTION_LENGTH}
				onChange={(kind) => {
					model.edit({ kind });
				}}
			/>
			<Field
				label="Title"
				value={model.draft.title}
				onChange={(title) => {
					model.edit({ title });
				}}
			/>
		</dl>
	);
}

interface DeclarationDialogContentProps {
	readonly model: CaseDeclarationModel;
}

function DeclarationDialogContent({
	model,
}: DeclarationDialogContentProps): React.JSX.Element {
	return (
		<div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
			<DeclarationIdentityFields model={model} />

			{model.draft.kind === "session" ? (
				<SessionFields draft={model.draft} edit={model.edit} />
			) : (
				<PipelineFields
					draft={model.draft}
					from={model.from}
					sources={model.sources}
					edit={model.edit}
				/>
			)}

			<DialogDescription>
				{model.draft.kind === "session"
					? "Writes cases/<id>/case.json in the control repository, formatted and left uncommitted for you to review and commit."
					: "Writes cases/<id>/ in the control repository: its case.json, the task and brief, and a copy of the chosen case's pipeline and rubrics, formatted and left uncommitted for you to review and commit."}
			</DialogDescription>

			{model.failure === undefined ? null : (
				<p role="alert" className="text-14 text-attention">
					<span aria-hidden="true">⚠ </span>
					{model.failure}
				</p>
			)}
		</div>
	);
}

export { DeclareForm as default };
export type { DeclareFormProps };
