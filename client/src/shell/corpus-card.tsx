import { useQuery } from "@tanstack/react-query";

import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { corpusSummaryQuery } from "#client/corpus/corpus-query";
import plural from "#client/plural";
import SectionLabel from "#client/system/components/section-label";

const FINAL_CORPUS_CAPTURE_TIME_OFFSET = -1;

function latestEdit(
	files: readonly Pick<CorpusResponse["files"][number], "lastEditedAt">[],
): string | undefined {
	const times = files.map((file) => file.lastEditedAt).toSorted();

	return times.at(FINAL_CORPUS_CAPTURE_TIME_OFFSET);
}

/**
 * What the card can say when the report withheld its digest. The server
 * returns no digest whenever any entry refused hashing, because a digest over
 * a partial tree would name a corpus that does not exist. The refusal is
 * reported in words rather than by the hash's absence alone (SPEC.md:402).
 */
interface DigestLineProps {
	readonly digest: string | undefined;
	readonly refusals: readonly string[];
}

function DigestLine({ digest, refusals }: DigestLineProps): React.JSX.Element {
	if (digest === undefined) {
		return (
			<span className="font-mono text-14 text-attention">
				<span aria-hidden="true">⚠ </span>
				{`digest withheld · ${plural(refusals.length, "refusal")}`}
			</span>
		);
	}

	return (
		<span className="font-mono text-14 text-pale">
			{corpusVersionLabel(digest)}
		</span>
	);
}

/** The always-visible answer to which corpus am I looking at (SPEC.md:62). */
interface CorpusCardProps {
	readonly enabled: boolean;
}

function CorpusCard({ enabled }: CorpusCardProps): React.JSX.Element {
	const query = useQuery({ ...corpusSummaryQuery, enabled });
	const edited =
		query.data === undefined ? undefined : latestEdit(query.data.files);

	return (
		<section
			aria-label="Corpus under test"
			className="min-w-0 border-t border-divider pt-2 md:rounded-lg md:border md:bg-card md:p-4"
		>
			<h2 className="hidden md:block">
				<SectionLabel>Corpus under test</SectionLabel>
			</h2>

			{query.isError ? (
				<p className="mt-1 text-12 text-attention" role="alert">
					<span aria-hidden="true">⚠ </span>
					Could not read the corpus
				</p>
			) : null}

			{query.data === undefined && !query.isError ? (
				<p className="mt-1 text-12 text-muted-foreground">
					Reading the corpus…
				</p>
			) : null}

			{query.data === undefined ? null : (
				<>
					<p className="flex flex-wrap items-center gap-x-3 gap-y-1 md:mt-3">
						<DigestLine
							digest={query.data.digest}
							refusals={query.data.refusals}
						/>
						<span className="font-mono text-12 text-muted-foreground">
							{plural(query.data.files.length, "file")}
						</span>
					</p>

					{edited === undefined ? null : (
						<p className="mt-3 hidden text-12 leading-reading text-muted-foreground md:block">
							{`last edit ${new Date(edited).toLocaleString()}`}
						</p>
					)}
				</>
			)}
		</section>
	);
}

export { CorpusCard as default };
