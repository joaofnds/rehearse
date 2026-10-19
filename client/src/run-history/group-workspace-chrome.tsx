import type { useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import plural from "#client/plural";
import ScreenHeader from "#client/system/components/screen-header";
import { Button } from "#client/system/ui/button";
import withinCase from "#client/within-case";

import type { GroupRow } from "./group-workspace-contract";
import {
	GROUP_ID_PREVIEW_CHARACTERS,
	PREFIX_START_INDEX,
} from "./group-workspace-contract";
import type { RunDiscoverySearch } from "./run-discovery";

function stalenessLine(row: GroupRow): string {
	if (row.staleness.state === "unavailable") {
		return `Staleness not judged: ${row.staleness.reasons.join("; ")}`;
	}
	return row.staleness.stale
		? "Corpus changed since this group"
		: "Corpus still matches this group";
}

interface GroupWorkspaceHeaderProps {
	readonly row: GroupRow;
	readonly groupId: string;
	readonly step: string | undefined;
	readonly comparison: string | undefined;
	readonly returnSearch: RunDiscoverySearch;
}

function GroupWorkspaceHeader({
	row,
	groupId,
	step,
	comparison,
	returnSearch,
}: GroupWorkspaceHeaderProps): React.JSX.Element {
	return (
		<ScreenHeader
			title={`Group ${withinCase(row.shortId ?? row.groupId.slice(PREFIX_START_INDEX, GROUP_ID_PREVIEW_CHARACTERS), row.caseId)}`}
			subline={`${row.caseId} · ${row.mode} · ${plural(row.reps, "rep")}${row.shortId === undefined ? "" : ` · ${row.shortId}`}`}
			aside={
				row.mode === "stage" && row.checkpoint !== undefined ? (
					<Button asChild size="sm">
						<Link
							to="/groups/$groupId"
							params={{ groupId }}
							search={{
								view: "results",
								...(step !== undefined && { step }),
								...(comparison !== undefined && { comparison }),
							}}
							hash="source-comparison"
						>
							Compare with source
						</Link>
					</Button>
				) : undefined
			}
			lead={
				<Link
					to="/"
					search={returnSearch}
					className="text-14 text-link underline"
				>
					← Runs
				</Link>
			}
		/>
	);
}

interface GroupViewNavigationProps {
	readonly navigate: ReturnType<typeof useNavigate>;
	readonly groupId: string;
	readonly view: "results" | "attempts";
	readonly step: string | undefined;
	readonly comparison: string | undefined;
}

function GroupViewNavigation({
	navigate,
	groupId,
	view,
	step,
	comparison,
}: GroupViewNavigationProps): React.JSX.Element {
	return (
		<nav
			aria-label="Group views"
			className="flex gap-1 border-b border-divider page-gutter"
		>
			{(["results", "attempts"] as const).map((item) => (
				<button
					key={item}
					type="button"
					aria-pressed={view === item}
					onClick={() => {
						void navigate({
							params: { groupId },
							search: {
								view: item,
								...(step !== undefined && { step }),
								...(comparison !== undefined && { comparison }),
							},
							to: "/groups/$groupId",
						});
					}}
					className="border-b-2 border-transparent px-3 py-2.5 text-14 text-muted-foreground aria-pressed:border-primary aria-pressed:text-foreground hover:text-foreground"
				>
					{item === "results" ? "Results" : "Attempts"}
				</button>
			))}
		</nav>
	);
}

interface GroupProvenanceProps {
	readonly row: GroupRow;
}

function GroupProvenance({ row }: GroupProvenanceProps): React.JSX.Element {
	return (
		<details className="rounded-lg border border-divider bg-card p-4 text-12">
			<summary className="cursor-pointer">Setup &amp; provenance</summary>
			<p className="mt-2">
				Record <code className="select-all wrap-anywhere">{row.groupId}</code>
				<br />
				Frozen {corpusMeasurementReading(row.corpusVersion)} ·{" "}
				{row.startedAt ?? "start time not recorded"}
			</p>
			<p className="text-dim">{stalenessLine(row)}</p>
			{row.checkpoint === undefined ? (
				<p className="text-dim">No source checkpoint recorded.</p>
			) : (
				<p>
					From{" "}
					<Link
						to="/runs/$run"
						params={{ run: row.checkpoint.run }}
						search={{ step: row.checkpoint.stage, view: "results" }}
						className="text-link underline"
					>
						source run · {row.checkpoint.stage}
					</Link>
				</p>
			)}
		</details>
	);
}

export { GroupProvenance, GroupViewNavigation, GroupWorkspaceHeader };
