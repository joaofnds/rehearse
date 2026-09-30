import { corpusVersionLabel } from "#benchmark/corpus-version-label";

export function CorpusPill({
	hash,
}: {
	readonly hash: string;
}): React.JSX.Element {
	return (
		<span className="inline-block rounded-full border border-accent-line px-2 py-0.5 font-mono text-sm text-pale">
			{corpusVersionLabel(hash)}
		</span>
	);
}
