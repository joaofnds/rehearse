import { corpusVersionLabel } from "#benchmark/corpus-version-label";

interface CorpusPillProps {
	readonly hash: string;
}

function CorpusPill({ hash }: CorpusPillProps): React.JSX.Element {
	return (
		<span className="inline-block rounded-full border border-accent-line px-2 py-0.5 font-mono text-12 text-pale">
			{corpusVersionLabel(hash)}
		</span>
	);
}

export { CorpusPill as default };
