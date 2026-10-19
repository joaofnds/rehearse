import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import EmptyState from "#client/system/components/empty-state";
import Notice from "#client/system/components/notice";

import CaseCard from "./case-card";
import CaseDetail from "./case-detail";
import type { CasesResponse } from "./cases-query";

const EMPTY_COLLECTION_LENGTH = 0;

interface SelectedCasesProps {
	readonly cases: CasesResponse["cases"];
	readonly caseId: string | undefined;
	readonly loaded: boolean;
	readonly corpusVersion: string | undefined;
	readonly hasUnreadable: boolean;
}

function SelectedCases({
	cases,
	caseId,
	loaded,
	corpusVersion,
	hasUnreadable,
}: SelectedCasesProps): React.JSX.Element {
	const visibleCases =
		caseId === undefined
			? cases
			: cases.filter((listed) => listed.id === caseId);
	return (
		<>
			{loaded &&
			caseId === undefined &&
			cases.length === EMPTY_COLLECTION_LENGTH &&
			!hasUnreadable ? (
				<EmptyState heading="No cases yet">
					<p>Use Declare a case above to add a session or workflow case.</p>
				</EmptyState>
			) : null}
			{caseId === undefined ? null : <SelectedCaseNavigation caseId={caseId} />}
			{loaded &&
			caseId !== undefined &&
			visibleCases.length === EMPTY_COLLECTION_LENGTH ? (
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

interface SelectedCaseNavigationProps {
	readonly caseId: string;
}

function SelectedCaseNavigation({
	caseId,
}: SelectedCaseNavigationProps): React.JSX.Element {
	return (
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
	);
}

interface CasesListingProps {
	readonly caseId: string | undefined;
	readonly corpusVersion: string | undefined;
	readonly declaredPath: string | undefined;
	readonly query: CasesReading;
	readonly cases: CasesResponse["cases"];
	readonly unreadable: CasesResponse["unreadable"];
	readonly unreadableRecords: CasesResponse["unreadableRecords"];
}

function CasesListing({
	caseId,
	corpusVersion,
	declaredPath,
	query,
	cases,
	unreadable,
	unreadableRecords,
}: CasesListingProps): React.JSX.Element {
	return (
		<div className="flex max-w-7xl flex-col gap-6 page-gutter pt-8 pb-12">
			{cases.length > EMPTY_COLLECTION_LENGTH ? (
				<p className="max-w-prose text-14 text-muted-foreground">
					Open a case to inspect its prompt, evaluation contract and evidence by
					corpus. Card figures use the newest recorded corpus version available
					for that case.
				</p>
			) : null}

			{declaredPath === undefined ? null : (
				<p role="status" className="text-14 text-secondary-foreground">
					{`Declared ${declaredPath}. It is uncommitted: review and commit it to keep the case.`}
				</p>
			)}

			<CasesReadStatus
				query={query}
				unreadable={unreadable}
				unreadableRecords={unreadableRecords}
			/>

			<SelectedCases
				cases={cases}
				caseId={caseId}
				loaded={query.isSuccess}
				corpusVersion={corpusVersion}
				hasUnreadable={
					unreadable.length > EMPTY_COLLECTION_LENGTH ||
					unreadableRecords.length > EMPTY_COLLECTION_LENGTH
				}
			/>
		</div>
	);
}

type CasesReading = Readonly<
	Pick<UseQueryResult<CasesResponse>, "isLoading" | "isError" | "isSuccess">
>;

interface CasesReadStatusProps {
	readonly query: CasesReading;
	readonly unreadable: CasesResponse["unreadable"];
	readonly unreadableRecords: CasesResponse["unreadableRecords"];
}

function CasesReadStatus({
	query,
	unreadable,
	unreadableRecords,
}: CasesReadStatusProps): React.JSX.Element {
	return (
		<>
			{query.isLoading ? (
				<p className="text-muted-foreground">Loading…</p>
			) : null}
			{query.isError ? (
				<p role="alert" className="text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not load the cases.
				</p>
			) : null}

			{unreadable.length > EMPTY_COLLECTION_LENGTH ? (
				<Notice
					message="These declarations could not be read, so no card shows them:"
					items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
				/>
			) : null}
			{unreadableRecords.length > EMPTY_COLLECTION_LENGTH ? (
				<Notice
					message="These run records could not be read, so their verdicts and costs are missing from the figures:"
					items={unreadableRecords.map(({ id, reason }) => `${id}: ${reason}`)}
				/>
			) : null}
		</>
	);
}

export { CasesListing as default };
