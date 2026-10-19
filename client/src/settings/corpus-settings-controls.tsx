import { Button } from "#client/system/ui/button";

interface CorpusLinkActionsProps {
	readonly writing: boolean;
	readonly linked: boolean;
	readonly onRehash: () => void;
	readonly onUnlink: () => void;
}

function CorpusLinkActions({
	writing,
	linked,
	onRehash,
	onUnlink,
}: CorpusLinkActionsProps): React.JSX.Element {
	return (
		<div className="mt-3 flex min-w-0 flex-wrap gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={writing}
				onClick={() => {
					onRehash();
				}}
			>
				Rehash now
			</Button>
			{linked ? (
				<Button
					variant="outline"
					size="sm"
					disabled={writing}
					onClick={() => {
						onUnlink();
					}}
				>
					Unlink corpus
				</Button>
			) : null}
		</div>
	);
}

interface CorpusDirectoryFormProps {
	readonly directory: string;
	readonly setDirectory: (directory: string) => void;
	readonly writing: boolean;
	readonly onLink: (directory: string) => void;
}

function CorpusDirectoryForm({
	directory,
	setDirectory,
	writing,
	onLink,
}: CorpusDirectoryFormProps): React.JSX.Element {
	return (
		<form
			className="mt-3 flex items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				onLink(directory);
			}}
		>
			<input
				value={directory}
				aria-label="Corpus directory to link"
				placeholder="an absolute path, or one starting with ~/"
				onChange={(event) => {
					setDirectory(event.target.value);
				}}
				className="min-h-touch-target min-w-0 flex-1 rounded-md border border-strong bg-background px-3 py-2 font-mono text-14"
			/>
			<Button
				type="submit"
				variant="outline"
				size="sm"
				disabled={directory === "" || writing}
			>
				Link
			</Button>
		</form>
	);
}

export { CorpusDirectoryForm, CorpusLinkActions };
