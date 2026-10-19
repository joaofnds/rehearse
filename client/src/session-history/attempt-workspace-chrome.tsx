import { Link } from "@tanstack/react-router";

import type { useRunsReturnSearch } from "#client/run-history/run-discovery";
import CurrentLink from "#client/system/components/current-link";
import ScreenHeader from "#client/system/components/screen-header";

import type { SiblingAttempt } from "./attempt-siblings";
import { MISSING_SEQUENCE_INDEX, attemptScope } from "./attempt-siblings";
import type { SessionHistoryIdentity } from "./session-history-page";

const ORDINAL_BASE = 1;

interface AttemptBreadcrumbProps {
	readonly caseId: string | undefined;
	readonly identity: SessionHistoryIdentity;
	readonly comparison: string | undefined;
	readonly position: number;
	readonly siblings: readonly SiblingAttempt[];
	readonly step: string | undefined;
}

function AttemptBreadcrumb({
	caseId,
	identity,
	comparison,
	position,
	siblings,
	step,
}: AttemptBreadcrumbProps): React.JSX.Element {
	return (
		<nav
			aria-label="Attempt breadcrumb"
			className="flex flex-wrap items-center gap-3"
		>
			<AttemptBreadcrumbLinks
				caseId={caseId}
				identity={identity}
				comparison={comparison}
				step={step}
			/>
			<span>
				{position === MISSING_SEQUENCE_INDEX
					? "Attempt position unavailable"
					: `Attempt ${String(position + ORDINAL_BASE)} of ${String(siblings.length)}`}
				{step === undefined ? "" : ` · ${step}`}
			</span>
			<span className="text-12 text-dim">{attemptScope(identity)}</span>
		</nav>
	);
}

interface AttemptHeaderProps {
	readonly title: string;
	readonly identity: SessionHistoryIdentity;
	readonly id: string | undefined;
	readonly runsSearch: ReturnType<typeof useRunsReturnSearch>;
}

function AttemptHeader({
	title,
	identity,
	id,
	runsSearch,
}: AttemptHeaderProps): React.JSX.Element {
	return (
		<ScreenHeader
			title={title}
			eyebrow="Saved attempt"
			lead={
				<Link
					to="/"
					search={runsSearch}
					className="text-14 text-link hover:text-link-hover"
				>
					← Back to Runs
				</Link>
			}
			subline={
				identity.kind === "stage"
					? "This step opens in its pipeline workspace."
					: "Recorded output and assessment"
			}
			aside={
				id === undefined ? undefined : (
					<details>
						<summary className="cursor-pointer text-14">
							{identity.kind === "confirmation"
								? "Saved repetition ID"
								: "Canonical record ID"}
						</summary>
						<code className="mt-2 block select-all text-12 wrap-anywhere">
							{identity.kind === "confirmation"
								? `${identity.groupId}/${identity.repId}`
								: id}
						</code>
					</details>
				)
			}
		/>
	);
}

interface AttemptViewTabsProps {
	readonly path: string;
	readonly view: "results" | "context";
	readonly step: string | undefined;
	readonly comparison: string | undefined;
}

function AttemptViewTabs({
	path,
	view,
	step,
	comparison,
}: AttemptViewTabsProps): React.JSX.Element {
	return (
		<nav
			aria-label="Attempt views"
			className="flex flex-wrap gap-2 border-b border-divider page-gutter py-3 text-14"
		>
			<CurrentLink
				to={path}
				search={{
					view: "results",
					...(step !== undefined && { step }),
					...(comparison !== undefined && { comparison }),
				}}
				marksCurrent={view === "results"}
				className="rounded-md border border-transparent px-3 py-2 text-link hover:underline current:border-primary current:bg-selected current:text-pale current:no-underline"
			>
				Results
			</CurrentLink>
			<CurrentLink
				to={path}
				search={{
					view: "context",
					...(step !== undefined && { step }),
					...(comparison !== undefined && { comparison }),
				}}
				marksCurrent={view === "context"}
				className="rounded-md border border-transparent px-3 py-2 text-link hover:underline current:border-primary current:bg-selected current:text-pale current:no-underline"
			>
				Context &amp; cost
			</CurrentLink>
		</nav>
	);
}

interface AttemptBreadcrumbLinksProps {
	readonly caseId: string | undefined;
	readonly identity: SessionHistoryIdentity;
	readonly comparison: string | undefined;
	readonly step: string | undefined;
}

function AttemptBreadcrumbLinks({
	caseId,
	identity,
	comparison,
	step,
}: AttemptBreadcrumbLinksProps): React.JSX.Element {
	return (
		<>
			{caseId === undefined ? null : (
				<Link
					to="/cases"
					search={{ caseId }}
					className="rounded-md border border-transparent px-3 py-2 text-link underline current:border-primary current:bg-selected current:text-pale current:no-underline"
				>
					{caseId}
				</Link>
			)}
			{identity.kind === "confirmation" ? (
				<Link
					to="/groups/$groupId"
					params={{ groupId: identity.groupId }}
					search={{
						view: "attempts",
						...(step !== undefined && { step }),
						...(comparison !== undefined && { comparison }),
					}}
					className="rounded-md border border-transparent px-3 py-2 text-link underline current:border-primary current:bg-selected current:text-pale current:no-underline"
				>
					Group results
				</Link>
			) : null}
			{comparison === undefined ? null : (
				<Link
					to="/comparisons/$digest"
					params={{ digest: comparison }}
					className="rounded-md border border-transparent px-3 py-2 text-link underline current:border-primary current:bg-selected current:text-pale current:no-underline"
				>
					Back to comparison
				</Link>
			)}
		</>
	);
}

export { AttemptBreadcrumb, AttemptHeader, AttemptViewTabs };
