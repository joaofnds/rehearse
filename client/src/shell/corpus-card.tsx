import { useQuery } from "@tanstack/react-query";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { corpusQuery } from "#client/corpus/corpus-query";
import { plural } from "#client/plural";
import { SectionLabel } from "#client/system/components/section-label";

function latestEdit(files: CorpusResponse["files"]): string | undefined {
	const times = files.map((file) => file.lastEditedAt).toSorted();

	return times.at(-1);
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
			<span className="font-mono text-sm text-pale">
				<span aria-hidden="true">⚠ </span>
				{`digest withheld · ${plural(refusals.length, "refusal")}`}
			</span>
		);
	}

	return (
		<span className="font-mono text-sm text-pale">{`corpus root@${digest}`}</span>
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
		<section
			aria-label="Corpus under test"
			className="mt-2.5 rounded-md border bg-raised px-2.5 py-2"
		>
			<h2>
				<SectionLabel>Corpus under test</SectionLabel>
			</h2>

			{query.isError ? (
				<p className="mt-1 text-xs text-muted-foreground" role="alert">
					<span aria-hidden="true">⚠ </span>
					Could not read the corpus
				</p>
			) : null}

			{query.data === undefined && !query.isError ? (
				<p className="mt-1 text-xs text-muted-foreground">
					Reading the corpus…
				</p>
			) : null}

			{query.data === undefined ? null : (
				<>
					<p className="mt-1 flex flex-wrap items-center gap-1.5">
						<DigestLine
							digest={query.data.digest}
							refusals={query.data.refusals}
						/>
						<span className="font-mono text-xs text-muted-foreground">
							{plural(query.data.files.length, "file")}
						</span>
					</p>

					{edited === undefined ? null : (
						<p className="mt-1 text-xs text-muted-foreground">
							{`last edit ${new Date(edited).toLocaleString()}`}
						</p>
					)}
				</>
			)}
		</section>
	);
}
