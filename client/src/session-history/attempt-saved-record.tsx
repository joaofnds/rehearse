const JSON_INDENT_SPACES = 2;

interface SavedRecordProps {
	readonly id: string;
	readonly label?: string;
	readonly open: boolean;
	readonly onToggle: () => void;
	readonly raw: string | undefined;
	readonly loading: boolean;
	readonly error: boolean;
}

function SavedRecord({
	id,
	label = "saved record JSON",
	open,
	onToggle,
	raw,
	loading,
	error,
}: SavedRecordProps): React.JSX.Element {
	const formatted = formatRecord(raw);
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<button
				type="button"
				aria-expanded={open}
				onClick={onToggle}
				className="text-14 text-link hover:underline"
			>
				{open ? `Hide ${label}` : `Show ${label}`}
			</button>
			{open ? (
				<>
					<p className="mt-2 font-mono text-12 text-dim">{id}</p>
					{loading ? (
						<p className="mt-2 text-12 text-dim">Loading record…</p>
					) : null}
					{error ? (
						<p role="alert" className="mt-2 text-12 text-dim">
							Saved record JSON unavailable.
						</p>
					) : null}
					{formatted === undefined ? null : (
						<pre
							data-testid="saved-record-json"
							className="mt-3 max-h-96 overflow-auto rounded border border-subtle bg-muted p-3 font-mono leading-transcript text-13 whitespace-pre-wrap break-all"
						>
							{formatted}
						</pre>
					)}
				</>
			) : null}
		</section>
	);
}

function formatRecord(raw: string | undefined): string | undefined {
	let formatted: string | undefined = undefined;
	if (raw !== undefined) {
		try {
			formatted = JSON.stringify(JSON.parse(raw), null, JSON_INDENT_SPACES);
		} catch {
			formatted = raw;
		}
	}
	return formatted;
}

export { SavedRecord as default };
