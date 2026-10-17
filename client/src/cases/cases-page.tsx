import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Notice } from "#client/system/components/notice";
import { ScreenHeader } from "#client/system/components/screen-header";
import { TasksPage } from "#client/tasks/tasks-page";
import { CaseCard } from "./case-card";
import { CaseDetail } from "./case-detail";
import type { CasesResponse } from "./cases-query";
import { casesQuery } from "./cases-query";
import { DeclareCaseDialog } from "./declare-case-dialog";

function SelectedCases({
	cases,
	caseId,
	loaded,
	corpusVersion,
}: {
	readonly cases: CasesResponse["cases"];
	readonly caseId: string | undefined;
	readonly loaded: boolean;
	readonly corpusVersion: string | undefined;
}): React.JSX.Element {
	const visibleCases =
		caseId === undefined
			? cases
			: cases.filter((listed) => listed.id === caseId);
	return (
		<>
			{caseId === undefined ? null : (
				<div className="flex flex-wrap items-center gap-3 text-14">
					<p role="status">{`Selected case: ${caseId}`}</p>
					<Link
						to="/cases"
						search={{}}
						className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
					>
						All cases
					</Link>
				</div>
			)}
			{loaded && caseId !== undefined && visibleCases.length === 0 ? (
				<p
					role="alert"
					className="text-14 text-attention"
				>{`Case ${caseId} was not found among the readable declarations.`}</p>
			) : null}
			{visibleCases.map((listed) => (
				<div key={listed.id} className="flex flex-col gap-6">
					<CaseCard listed={listed} showFigures={caseId === undefined} />
					{caseId === undefined ? null : (
						<CaseDetail listed={listed} corpusVersion={corpusVersion} />
					)}
				</div>
			))}
		</>
	);
}

export function CasesPage({
	view = "cases",
	caseId,
	corpusVersion,
}: {
	readonly view?: "cases" | "workflows";
	readonly caseId?: string;
	readonly corpusVersion?: string;
}): React.JSX.Element {
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
			<nav
				aria-label="Case sections"
				className="flex gap-1 border-b border-divider px-6"
			>
				<Link
					to="/cases"
					search={{}}
					aria-current={view === "cases" ? "page" : undefined}
					className="border-b-2 border-transparent px-3 py-2.5 text-14 text-link no-underline current:border-primary current:bg-selected current:text-pale hover:text-link-hover"
				>
					Cases
				</Link>
				<Link
					to="/cases"
					search={{ view: "workflows" }}
					aria-current={view === "workflows" ? "page" : undefined}
					className="border-b-2 border-transparent px-3 py-2.5 text-14 text-link no-underline current:border-primary current:bg-selected current:text-pale hover:text-link-hover"
				>
					Workflows
				</Link>
			</nav>

			{view === "workflows" ? (
				<TasksPage embedded {...(caseId === undefined ? {} : { caseId })} />
			) : (
				<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
					<p className="max-w-prose text-14 text-muted-foreground">
						Open a case to inspect its prompt, evaluation contract and evidence
						by corpus. Card figures use the newest recorded corpus version
						available for that case.
					</p>

					{declaredPath === undefined ? null : (
						<p role="status" className="text-14 text-secondary-foreground">
							{`Declared ${declaredPath}. It is uncommitted: review and commit it to keep the case.`}
						</p>
					)}

					{query.isLoading ? (
						<p className="text-muted-foreground">Loading…</p>
					) : null}
					{query.isError ? (
						<p role="alert" className="text-attention">
							<span aria-hidden="true">⚠ </span>
							Could not load the cases.
						</p>
					) : null}

					{unreadable.length > 0 ? (
						<Notice
							message="These declarations could not be read, so no card shows them:"
							items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
						/>
					) : null}
					{unreadableRecords.length > 0 ? (
						<Notice
							message="These run records could not be read, so their verdicts and costs are missing from the figures:"
							items={unreadableRecords.map(
								({ id, reason }) => `${id}: ${reason}`,
							)}
						/>
					) : null}

					<SelectedCases
						cases={cases}
						caseId={caseId}
						loaded={query.isSuccess}
						corpusVersion={corpusVersion}
					/>
				</div>
			)}
		</div>
	);
}
