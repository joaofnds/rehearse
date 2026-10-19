import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import Attempts from "./group-attempts";
import ReadingPanel from "./group-instruction-reads";
import Results from "./group-results";
import {
	GroupProvenance,
	GroupViewNavigation,
	GroupWorkspaceHeader,
} from "./group-workspace-chrome";
import type { GroupRow } from "./group-workspace-contract";
import type { RunDiscoverySearch } from "./run-discovery";
import { useRunsReturnSearch } from "./run-discovery";
import { runHistoryQuery } from "./run-history-query";

interface GroupWorkspacePageProps {
	readonly groupId: string;
	readonly view: "results" | "attempts";
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}

function GroupWorkspacePage({
	groupId,
	view,
	step,
	comparison,
}: GroupWorkspacePageProps): React.JSX.Element {
	const returnSearch = useRunsReturnSearch();
	const { row, isLoading, isError } = useGroupHistory(groupId);
	const navigate = useNavigate();
	if (isLoading) {
		return (
			<p className="page-gutter py-4 text-muted-foreground">Loading group…</p>
		);
	}
	if (isError) {
		return (
			<p role="alert" className="page-gutter py-4 text-attention">
				Could not load the group history.
			</p>
		);
	}
	if (row === undefined) {
		return (
			<p role="alert" className="page-gutter py-4 text-attention">
				No saved group {groupId} was found.
			</p>
		);
	}
	return (
		<GroupWorkspaceContent
			row={row}
			groupId={groupId}
			view={view}
			step={step}
			comparison={comparison}
			returnSearch={returnSearch}
			navigate={navigate}
		/>
	);
}

interface GroupHistoryRead {
	readonly row: GroupRow | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
}

function useGroupHistory(groupId: string): GroupHistoryRead {
	const query = useQuery(runHistoryQuery);
	const row = query.data?.rows.find(
		(candidate): candidate is GroupRow =>
			candidate.kind === "group" && candidate.groupId === groupId,
	);
	return { isError: query.isError, isLoading: query.isLoading, row };
}

interface GroupResultBodyProps {
	readonly row: GroupRow;
	readonly groupId: string;
	readonly view: "results" | "attempts";
	readonly step: string | undefined;
	readonly comparison: string | undefined;
}

function GroupResultBody({
	row,
	groupId,
	view,
	step,
	comparison,
}: GroupResultBodyProps): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-col gap-4 page-gutter pt-8 pb-12">
			<GroupProvenance row={row} />
			{view === "results" ? (
				<Results row={row} />
			) : (
				<Attempts row={row} step={step} comparison={comparison} />
			)}
			<details className="rounded-lg border border-divider bg-card p-4 text-14">
				<summary>Frozen instruction reads</summary>
				<div className="mt-3">
					<ReadingPanel groupId={groupId} />
				</div>
			</details>
			{comparison === undefined ? null : (
				<Link
					to="/comparisons/$digest"
					params={{ digest: comparison }}
					className="text-14 text-link underline"
				>
					Back to comparison
				</Link>
			)}
			<Link
				to="/comparisons"
				className="self-start text-14 text-link underline"
			>
				Browse saved comparisons
			</Link>
		</div>
	);
}

interface GroupWorkspaceContentProps {
	readonly row: GroupRow;
	readonly groupId: string;
	readonly view: "results" | "attempts";
	readonly step: string | undefined;
	readonly comparison: string | undefined;
	readonly returnSearch: RunDiscoverySearch;
	readonly navigate: ReturnType<typeof useNavigate>;
}

function GroupWorkspaceContent({
	row,
	groupId,
	view,
	step,
	comparison,
	returnSearch,
	navigate,
}: GroupWorkspaceContentProps): React.JSX.Element {
	return (
		<div>
			<GroupWorkspaceHeader
				row={row}
				groupId={groupId}
				step={step}
				comparison={comparison}
				returnSearch={returnSearch}
			/>
			<GroupViewNavigation
				navigate={navigate}
				groupId={groupId}
				view={view}
				step={step}
				comparison={comparison}
			/>
			<GroupResultBody
				row={row}
				groupId={groupId}
				view={view}
				step={step}
				comparison={comparison}
			/>
		</div>
	);
}

export type { GroupReads } from "./group-workspace-contract";
export { GroupWorkspacePage as default };
