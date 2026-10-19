import { Link } from "@tanstack/react-router";
import { useState } from "react";

import Switcher from "#client/system/components/switcher";

import type {
	SearchGroup,
	SearchResult,
	SearchScope,
} from "./search-result-grouping";
import { COLLECTIONS, searchResultGroups } from "./search-result-grouping";
import useSearchCollections from "./use-search-collections";

const EMPTY_COLLECTION_LENGTH = 0;

interface SearchResultsProps {
	readonly query: string;
	readonly close: () => void;
}

function SearchResults({
	query,
	close,
}: SearchResultsProps): React.JSX.Element {
	const { results, failures, loading } = useSearchCollections(query);
	const [scope, setScope] = useState<SearchScope>("All");

	const visible = results.filter(
		(result) => scope === "All" || result.collection === scope,
	);
	const groups = searchResultGroups(visible, query);

	return (
		<div className="flex flex-col gap-2 px-5 pb-5">
			<Switcher
				label="Search collection"
				options={COLLECTIONS}
				selected={scope}
				onSelect={setScope}
			/>
			<p className="text-12 text-dim">
				Saved metadata only · IDs, case titles, instruction paths and digests.
				File bodies and transcripts are not searched.
			</p>
			<SearchCollectionStatus failures={failures} loading={loading} />
			{query.trim() === "" ? (
				<p className="text-12 text-dim">
					Search saved run IDs, cases, instruction paths and comparison IDs.
				</p>
			) : (
				<SearchMatches
					visible={visible}
					scope={scope}
					groups={groups}
					close={close}
				/>
			)}
		</div>
	);
}

interface SearchMatchesProps {
	readonly visible: readonly SearchResult[];
	readonly scope: SearchScope;
	readonly groups: readonly SearchGroup[];
	readonly close: () => void;
}

function SearchMatches({
	visible,
	scope,
	groups,
	close,
}: SearchMatchesProps): React.JSX.Element {
	return (
		<>
			<p
				role="status"
				className="text-12 text-dim"
			>{`${visible.length} matching destinations${scope === "All" ? "" : ` in ${scope.toLowerCase()}`}`}</p>
			{visible.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="text-14 text-muted-foreground">
					No matching destinations. Try a run ID, case or file path.
				</p>
			) : (
				groups.map((group) => (
					<SearchCollectionGroup
						key={group.collection}
						group={group}
						close={close}
					/>
				))
			)}
		</>
	);
}

interface SearchCollectionGroupProps {
	readonly group: SearchGroup;
	readonly close: () => void;
}

function SearchCollectionGroup({
	group,
	close,
}: SearchCollectionGroupProps): React.JSX.Element {
	return (
		<section
			key={group.collection}
			aria-label={`${group.collection} search results`}
			className="mt-2 flex flex-col gap-2"
		>
			<h3 className="text-12 font-medium">
				{group.collection}{" "}
				<span className="text-dim">({group.results.length})</span>
			</h3>
			{group.results.map((result) => (
				<Link
					key={`${result.kind}:${result.href}`}
					to={result.href}
					onClick={close}
					className="flex flex-col gap-1 rounded-md border border-divider bg-card px-4 py-2 hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span className="flex items-center gap-3">
						<span className="text-12 text-dim">{result.kind}</span>
						<span className="min-w-0 break-words font-mono text-14 text-link">
							{result.label}
						</span>
					</span>
					<span className="text-12 text-muted-foreground">{result.detail}</span>
				</Link>
			))}
		</section>
	);
}

interface SearchCollectionStatusProps {
	readonly failures: readonly string[];
	readonly loading: boolean;
}

function SearchCollectionStatus({
	failures,
	loading,
}: SearchCollectionStatusProps): React.JSX.Element {
	return (
		<>
			{failures.map((label) => (
				<p
					key={label}
					role="alert"
					className="text-14 text-attention"
				>{`${label} could not be loaded. Other results remain available.`}</p>
			))}
			{loading ? (
				<p role="status" className="text-12 text-dim">
					Loading search collections…
				</p>
			) : null}
		</>
	);
}

export { SearchResults as default };
