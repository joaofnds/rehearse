import { useQuery } from "@tanstack/react-query";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { corpusQuery } from "#client/corpus/corpus-query";
import "./corpus-card.css";

function latestEdit(files: CorpusResponse["files"]): string | undefined {
	const times = files.map((file) => file.lastEditedAt).toSorted();

	return times.at(-1);
}

function plural(count: number, noun: string): string {
	return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

/**
 * What the card can say when the report withheld its digest. The server
 * returns no digest whenever any entry refused hashing, because a digest over
 * a partial tree would name a corpus that does not exist. The refusal is
 * reported in words rather than by the hash's absence alone (SPEC.md:402).
 */
function DigestLine({
	digest,
	refusals,
}: {
	readonly digest: string | undefined;
	readonly refusals: readonly string[];
}): React.JSX.Element {
	if (digest === undefined) {
		return (
			<span className="rh-corpus-card__digest">
				<span aria-hidden="true">⚠ </span>
				{`digest withheld · ${plural(refusals.length, "refusal")}`}
			</span>
		);
	}

	return (
		<span className="rh-corpus-card__digest">{`corpus root@${digest}`}</span>
	);
}

/**
 * The always-visible answer to which corpus am I looking at (SPEC.md:62). The
 * hash is labeled `corpus root@`, not the design's `corpus@`: GLOSSARY.md
 * fixes those as two labels over two different file sets, and this one digests
 * every file in the live tree.
 */
export function CorpusCard(): React.JSX.Element {
	const query = useQuery(corpusQuery);
	const edited =
		query.data === undefined ? undefined : latestEdit(query.data.files);

	return (
		<section className="rh-corpus-card" aria-label="Corpus under test">
			<h2 className="rh-corpus-card__label">Corpus under test</h2>

			{query.isError ? (
				<p className="rh-corpus-card__pending" role="alert">
					<span aria-hidden="true">⚠ </span>
					Could not read the corpus
				</p>
			) : null}

			{query.data === undefined && !query.isError ? (
				<p className="rh-corpus-card__pending">Reading the corpus…</p>
			) : null}

			{query.data === undefined ? null : (
				<>
					<p className="rh-corpus-card__line">
						<DigestLine
							digest={query.data.digest}
							refusals={query.data.refusals}
						/>
						<span className="rh-corpus-card__files">
							{plural(query.data.files.length, "file")}
						</span>
					</p>

					{edited === undefined ? null : (
						<p className="rh-corpus-card__edited">
							{`last edit ${new Date(edited).toLocaleString()}`}
						</p>
					)}
				</>
			)}
		</section>
	);
}
