import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import CurrentLink from "#client/system/components/current-link";
import ScreenHeader from "#client/system/components/screen-header";
import TasksPage from "#client/tasks/tasks-page";

import CasesListing from "./case-listing";
import casesQuery from "./cases-query";
import DeclareCaseDialog from "./declare-case-dialog";

interface CasesPageProps {
	readonly view?: "cases" | "workflows";
	readonly caseId?: string;
	readonly corpusVersion?: string;
}

function CasesPage({
	view = "cases",
	caseId,
	corpusVersion,
}: CasesPageProps): React.JSX.Element {
	const query = useQuery(casesQuery);
	const [declaredPath, setDeclaredPath] = useState<string>();
	const cases = query.data?.cases ?? [];

	const unreadable = query.data?.unreadable ?? [];
	const unreadableRecords = query.data?.unreadableRecords ?? [];

	return (
		<div>
			<ScreenHeader
				title="Cases"
				subline={
					view === "cases"
						? "Declared as data on disk · cases/*/case.json"
						: "Workflow definitions used by cases"
				}
				aside={
					view === "cases" ? (
						<DeclareCaseDialog onDeclared={setDeclaredPath} />
					) : undefined
				}
			/>
			<CaseSections view={view} />

			{view === "workflows" ? (
				<TasksPage embedded {...(caseId === undefined ? {} : { caseId })} />
			) : (
				<CasesListing
					caseId={caseId}
					corpusVersion={corpusVersion}
					declaredPath={declaredPath}
					query={query}
					cases={cases}
					unreadable={unreadable}
					unreadableRecords={unreadableRecords}
				/>
			)}
		</div>
	);
}

interface CaseSectionsProps {
	readonly view: "cases" | "workflows";
}

function CaseSections({ view }: CaseSectionsProps): React.JSX.Element {
	return (
		<nav
			aria-label="Case sections"
			className="flex gap-1 border-b border-divider page-gutter"
		>
			<CurrentLink
				to="/cases"
				search={{}}
				marksCurrent={view === "cases"}
				className="inline-flex min-h-touch-target items-center rounded-t-md border-b-2 border-transparent px-4 py-2.5 text-14 text-link no-underline current:border-primary current:bg-selected current:text-pale hover:text-link-hover"
			>
				Cases
			</CurrentLink>
			<CurrentLink
				to="/cases"
				search={{ view: "workflows" }}
				marksCurrent={view === "workflows"}
				className="inline-flex min-h-touch-target items-center rounded-t-md border-b-2 border-transparent px-4 py-2.5 text-14 text-link no-underline current:border-primary current:bg-selected current:text-pale hover:text-link-hover"
			>
				Workflows
			</CurrentLink>
		</nav>
	);
}

export { CasesPage as default };
