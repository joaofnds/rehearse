import { DialogDescription } from "#client/system/ui/dialog";
import FileInput from "#client/system/ui/file-input";

import { DialogHeader, ImportActions } from "./task-bundle-chrome";
import ImportDestination from "./task-bundle-fields";
import type { ImportFormProps } from "./use-task-bundle-import";
import useBundleImport from "./use-task-bundle-import";

function ImportForm({ onImported }: ImportFormProps): React.JSX.Element {
	const model = useBundleImport(onImported);

	return (
		<form
			className="flex min-h-0 min-w-0 flex-col"
			onSubmit={(event) => {
				event.preventDefault();
				if (model.bundleText !== undefined) {
					model.imported.mutate({
						...model.draft,
						bundleText: model.bundleText,
					});
				}
			}}
		>
			<DialogHeader title="Import workflow" />
			<div className="relative flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-y-contain px-4 py-3.5">
				<BundleFileChoice
					fileId={model.fileId}
					onChoose={(file) => {
						model.imported.reset();
						void model.readBundle(file);
					}}
				/>

				{model.preview.isSuccess ? (
					<ImportDestination
						preview={model.preview.data}
						draft={model.draft}
						edit={model.edit}
					/>
				) : null}

				<BundleImportNotice failure={model.refusal?.message} />
			</div>
			<ImportActions
				canImport={model.preview.isSuccess}
				pending={model.imported.isPending}
			/>
		</form>
	);
}

interface BundleFileChoiceProps {
	readonly fileId: string;
	readonly onChoose: (file: Readonly<Blob>) => void;
}

function BundleFileChoice({
	fileId,
	onChoose,
}: BundleFileChoiceProps): React.JSX.Element {
	return (
		<label htmlFor={fileId} className="flex min-w-0 flex-col gap-1 text-14">
			<span className="text-muted-foreground">Workflow bundle</span>
			<FileInput
				id={fileId}
				accept=".json,application/json"
				onChoose={onChoose}
			/>
		</label>
	);
}

interface BundleImportNoticeProps {
	readonly failure: string | undefined;
}

function BundleImportNotice({
	failure,
}: BundleImportNoticeProps): React.JSX.Element {
	return (
		<>
			<DialogDescription>
				Writes the workflow as a new case under cases/&lt;id&gt;/ in the control
				repository, formatted and left uncommitted for you to review and commit.
			</DialogDescription>

			{failure === undefined ? null : (
				<p role="alert" className="text-14 text-attention wrap-anywhere">
					<span aria-hidden="true">⚠ </span>
					{failure}
				</p>
			)}
		</>
	);
}

export { ImportForm as default };
