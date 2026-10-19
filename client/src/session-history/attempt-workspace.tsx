import { Link } from "@tanstack/react-router";

import { useRunsReturnSearch } from "#client/run-history/run-discovery";

import AttemptContext from "./attempt-context";
import AttemptNavigation from "./attempt-navigation";
import {
	attemptPath,
	recordId,
	useAttemptTitle,
} from "./attempt-record-identity";
import ResultsContent from "./attempt-results-content";
import { AttemptHeader, AttemptViewTabs } from "./attempt-workspace-chrome";
import type { SessionHistoryIdentity } from "./session-history-page";

interface AttemptWorkspacePageProps {
	readonly identity: SessionHistoryIdentity;
	readonly view?: "results" | "context";
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}

function AttemptWorkspacePage({
	identity,
	view = "results",
	step,
	comparison,
}: AttemptWorkspacePageProps): React.JSX.Element {
	const path = attemptPath(identity);
	const runsSearch = useRunsReturnSearch();
	const id = identity.kind === "stage" ? undefined : recordId(identity);
	const title = useAttemptTitle(identity);

	return (
		<div className="flex min-h-full flex-col">
			<AttemptHeader
				title={title}
				identity={identity}
				id={id}
				runsSearch={runsSearch}
			/>
			<AttemptNavigation
				identity={identity}
				view={view}
				{...(step !== undefined && { step })}
				{...(comparison !== undefined && { comparison })}
			/>
			{identity.kind === "stage" ? (
				<p className="p-6 text-12 text-dim">
					Open the{" "}
					<Link to={path} className="text-link hover:underline">
						pipeline step
					</Link>{" "}
					for its results.
				</p>
			) : (
				<AttemptView
					identity={identity}
					path={path}
					view={view}
					step={step}
					comparison={comparison}
				/>
			)}
		</div>
	);
}

interface AttemptViewProps {
	readonly identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>;
	readonly path: string;
	readonly view: "results" | "context";
	readonly step: string | undefined;
	readonly comparison: string | undefined;
}

function AttemptView({
	identity,
	path,
	view,
	step,
	comparison,
}: AttemptViewProps): React.JSX.Element {
	return (
		<>
			<AttemptViewTabs
				path={path}
				view={view}
				step={step}
				comparison={comparison}
			/>
			{view === "context" ? (
				<AttemptContext identity={identity} />
			) : (
				<ResultsContent
					key={path}
					identity={identity}
					{...(step !== undefined && { step })}
					{...(comparison !== undefined && { comparison })}
				/>
			)}
		</>
	);
}

export { AttemptWorkspacePage as default };
