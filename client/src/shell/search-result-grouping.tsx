const EMPTY_COLLECTION_LENGTH = 0;

const SEARCH_MATCH_RANK_CONTAINS = 2;

const SEARCH_MATCH_RANK_EXACT = 0;

const SEARCH_MATCH_RANK_PREFIX = 1;

interface SearchResult {
	readonly collection: SearchCollection;
	readonly kind: string;
	readonly label: string;
	readonly detail: string;
	readonly href: string;
}

const COLLECTIONS = [
	"All",
	"Cases",
	"Instructions",
	"Comparisons",
	"Runs",
] as const;

type SearchScope = (typeof COLLECTIONS)[number];

type SearchCollection = Exclude<SearchScope, "All">;

function matchRank(result: SearchResult, query: string): number {
	const needle = query.trim().toLowerCase();
	if (result.label.toLowerCase() === needle) {
		return SEARCH_MATCH_RANK_EXACT;
	}
	return result.label.toLowerCase().startsWith(needle)
		? SEARCH_MATCH_RANK_PREFIX
		: SEARCH_MATCH_RANK_CONTAINS;
}

interface SearchGroup {
	readonly collection: SearchCollection;
	readonly results: readonly SearchResult[];
}

function searchResultGroups(
	visible: readonly SearchResult[],
	query: string,
): readonly SearchGroup[] {
	const groups = COLLECTIONS.filter(
		(collection): collection is SearchCollection => collection !== "All",
	)
		.map((collection) => ({
			collection,
			results: visible
				.filter((result) => result.collection === collection)
				.toSorted(
					(left, right) => matchRank(left, query) - matchRank(right, query),
				),
		}))
		.filter((group) => group.results.length > EMPTY_COLLECTION_LENGTH)
		.toSorted(
			(left, right) =>
				Math.min(...left.results.map((result) => matchRank(result, query))) -
				Math.min(...right.results.map((result) => matchRank(result, query))),
		);
	return groups;
}

export { COLLECTIONS, searchResultGroups };
export type { SearchGroup, SearchResult, SearchScope };
