import { useQuery } from "@tanstack/react-query";

import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { corpusQuery } from "#client/corpus/corpus-query";

import type { Outcome } from "./use-corpus-settings";

/**
 * The label the corpus screen shows for the corpus under test, once the
 * corpus read is of the root linked now rather than the one linked before.
 */
function VersionLabel({
	root,
}: Readonly<{ root: string }>): React.JSX.Element | null {
	const corpus = useQuery(corpusQuery);
	if (corpus.isError) {
		return (
			<span className="text-attention">
				<span aria-hidden="true">⚠ </span>
				corpus unreadable
			</span>
		);
	}

	if (corpus.data?.root !== root) {
		return null;
	}

	return (
		<span
			className={
				corpus.data.digest === undefined ? "text-attention" : "text-pale"
			}
		>
			{corpus.data.digest === undefined ? (
				<>
					<span aria-hidden="true">⚠ </span>
					digest withheld
				</>
			) : (
				corpusVersionLabel(corpus.data.digest)
			)}
		</span>
	);
}

interface CorpusSettingsOutcomeProps {
	readonly outcome: Outcome;
}

function CorpusSettingsOutcome({
	outcome,
}: CorpusSettingsOutcomeProps): React.JSX.Element {
	return (
		<>
			{outcome.kind === "rehashed" ? (
				<p className="mt-1.5 font-mono text-12 text-pale">
					{`Rehashed as ${outcome.label}`}
				</p>
			) : null}
			{outcome.kind === "refused" ? (
				<p role="alert" className="mt-1.5 text-12 text-attention">
					<span aria-hidden="true">⚠ </span>
					{outcome.reason}
				</p>
			) : null}
		</>
	);
}

export { VersionLabel as default, CorpusSettingsOutcome };
