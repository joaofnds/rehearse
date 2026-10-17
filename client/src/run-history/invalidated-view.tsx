import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { corpusQuery } from "#client/corpus/corpus-query";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { plural } from "#client/plural";
import { Notice } from "#client/system/components/notice";
import { invalidatedByValue } from "./invalidated-by";
import type { InvalidatedSelection, Read } from "./invalidated-selection";
import { invalidatedSelection } from "./invalidated-selection";
import type { RunHistoryResponse } from "./run-history-query";

/**
 * A query's last good body while it has one, so a failed re-read keeps what
 * was listed, as the rest of run history does.
 */
export function readOf<Body>(query: {
	readonly isError: boolean;
	readonly data: Body | undefined;
}): Read<Body> {
	if (query.data !== undefined) {
		return { state: "loaded", body: query.data };
	}
	if (query.isError) {
		return { state: "failed" };
	}

	return { state: "loading" };
}

export function InvalidatedNotice({
	selection,
}: {
	readonly selection: InvalidatedSelection;
}): React.JSX.Element {
	switch (selection.kind) {
		case "unanswered": {
			return <p className="text-muted-foreground">{selection.reason}</p>;
		}
		case "moved-on": {
			return (
				<p className="text-muted-foreground">
					{
						"The edit this address names is no longer the last edit, and no list of its results is kept, so none is listed. "
					}
					<Link
						to="/"
						search={{ invalidatedBy: invalidatedByValue(selection.last) }}
						className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
					>
						review the last edit's results
					</Link>
				</p>
			);
		}
		case "listed": {
			const { edit, count, missing } = selection;

			return (
				<>
					<p className="text-secondary-foreground">
						{`${plural(count, "recorded result")} invalidated by the edit from ${corpusVersionLabel(edit.previous)} to ${corpusVersionLabel(edit.current)}`}
					</p>
					{missing.length > 0 ? (
						<Notice
							message="These invalidated results have no readable row, so they are missing from the table below:"
							items={missing.map(
								({ id, reason }) =>
									`${id}: ${reason ?? "no row in run history"}`,
							)}
						/>
					) : null}
				</>
			);
		}
		default: {
			return selection satisfies never;
		}
	}
}

/**
 * The cached corpus report can name an edit that is no longer the last, and
 * it does not poll, so the filtered view reads it again on mount and waits.
 * A later read keeps the rows listed until it answers.
 */
export function useInvalidatedSelection(
	invalidatedBy: string | undefined,
	runs: Read<RunHistoryResponse>,
): InvalidatedSelection | undefined {
	const corpus = useQuery({
		...corpusQuery,
		enabled: invalidatedBy !== undefined,
		refetchOnMount: "always",
	});
	if (invalidatedBy === undefined) {
		return undefined;
	}

	const corpusRead: Read<CorpusResponse> = corpus.isFetchedAfterMount
		? readOf(corpus)
		: { state: "loading" };

	return invalidatedSelection(invalidatedBy, corpusRead, runs);
}
