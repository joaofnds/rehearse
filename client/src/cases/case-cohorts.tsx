import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import plural from "#client/plural";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { runListingQuery } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";
import Metric from "#client/system/components/metric";
import SummaryPanel from "#client/system/components/summary-panel";
import NativeSelect from "#client/system/ui/native-select";

import type { ListedCase } from "./case-card";
import CohortMembers from "./case-cohort-members";

const NO_COHORT_MEMBERS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

interface CaseCohortsProps {
	readonly listed: ListedCase;
	readonly corpusVersion: string | undefined;
}

function CaseCohorts({
	listed,
	corpusVersion,
}: CaseCohortsProps): React.JSX.Element {
	const navigate = useNavigate();
	const listing = useQuery(runListingQuery);
	const selection = selectedCohort(listed, corpusVersion);
	return (
		<div id="case-evidence" className="scroll-mt-6">
			<SummaryPanel
				title="Run evidence by corpus"
				description="One cohort at a time. Whole-case runs and individual attempts from finished groups count; step replays and stage-only groups are excluded."
			>
				{selection.cohorts.length === EMPTY_COLLECTION_LENGTH ? (
					<p className="text-14 text-muted-foreground">
						{listed.figures.state === "no-runs"
							? "No runs have been recorded for this case."
							: "Cohort member evidence is unavailable from this listing."}
					</p>
				) : (
					<CohortSelectionReading
						listed={listed}
						selection={selection}
						navigate={navigate}
						rows={listing.data?.rows ?? []}
					/>
				)}
			</SummaryPanel>
		</div>
	);
}

interface CohortChoiceProps {
	readonly cohorts: NonNullable<ListedCase["cohorts"]>;
	readonly selectedKey: string | undefined;
	readonly cohort: NonNullable<ListedCase["cohorts"]>[number] | undefined;
	readonly caseId: string;
	readonly navigate: ReturnType<typeof useNavigate>;
}

function CohortChoice({
	cohorts,
	selectedKey,
	cohort,
	caseId,
	navigate,
}: CohortChoiceProps): React.JSX.Element {
	return (
		<label className="flex flex-wrap items-center gap-3 text-14">
			Corpus cohort
			<NativeSelect
				aria-label="Corpus cohort"
				value={selectedKey ?? ""}
				onChange={(event) => {
					void navigate({
						hash: "case-evidence",
						search: {
							caseId,
							corpusVersion: event.target.value,
						},
						to: "/cases",
					});
				}}
			>
				{cohort === undefined ? (
					<option value={selectedKey}>Unknown corpus selection</option>
				) : null}
				{cohorts.map((entry) => (
					<option
						key={entry.corpusVersion ?? "unrecorded"}
						value={entry.corpusVersion ?? "unrecorded"}
					>
						{entry.corpusVersion === null
							? "Corpus version not recorded"
							: `corpus@${entry.corpusVersion}`}{" "}
						· {plural(entry.members.length, "run")}
					</option>
				))}
			</NativeSelect>
		</label>
	);
}

interface CohortFiguresProps {
	readonly listed: ListedCase;
	readonly figures: Extract<
		NonNullable<ListedCase["cohorts"]>[number]["figures"],
		{ state: "measured" }
	>;
	readonly cohorts: NonNullable<ListedCase["cohorts"]>;
}

function CohortFigures({
	listed,
	figures,
	cohorts,
}: CohortFiguresProps): React.JSX.Element {
	return (
		<>
			<dl className="my-5 grid gap-5 sm:grid-cols-3">
				<CohortMeasure
					label="Runs in this cohort"
					value={<>{figures.counted}</>}
					hint={`${plural(cohorts.reduce((sum, entry) => sum + entry.members.length, NO_COHORT_MEMBERS) - figures.counted, "run")} in other cohorts`}
				/>
				<CohortMeasure
					label={
						listed.kind === "session"
							? "Reply/transcript checks passed"
							: "Final Judge passed"
					}
					value={
						<>
							{figures.passed} / {figures.judged} assessed
						</>
					}
					hint={`${String(figures.counted - figures.judged)} unassessed of ${plural(figures.counted, "run")}`}
				/>
				<CohortMeasure
					label="Mean reported cost per run"
					value={
						<>
							{figures.costPerRun.meanUsd === null
								? "Unavailable"
								: spendReading(figures.costPerRun.meanUsd)}
						</>
					}
					hint={`${String(figures.costPerRun.costed)} costed; ${String(figures.costPerRun.lacking)} without a complete cost`}
				/>
			</dl>
			{listed.kind === "session" ? (
				<p className="mb-4 text-14 text-muted-foreground">
					Pass figures use recorded reply/transcript checks. Open an attempt to
					inspect saved-state checks and any disagreement.
				</p>
			) : null}
		</>
	);
}

interface CohortMeasureProps {
	readonly label: string;
	readonly value: React.ReactNode;
	readonly hint: string;
}

function CohortMeasure({
	label,
	value,
	hint,
}: CohortMeasureProps): React.JSX.Element {
	return (
		<Metric
			label={label}
			value={
				<a href="#case-members" className="text-link hover:underline">
					{value}
				</a>
			}
			hint={hint}
		/>
	);
}

interface SelectedCohort {
	readonly cohorts: NonNullable<ListedCase["cohorts"]>;
	readonly selectedKey: string | undefined;
	readonly cohort: NonNullable<ListedCase["cohorts"]>[number] | undefined;
	readonly figures:
		| NonNullable<ListedCase["cohorts"]>[number]["figures"]
		| undefined;
}

function selectedCohort(
	listed: ListedCase,
	corpusVersion: string | undefined,
): SelectedCohort {
	const cohorts = listed.cohorts ?? [];
	const defaultCorpus =
		listed.figures.state === "measured"
			? (listed.figures.corpusVersion ?? "unrecorded")
			: undefined;
	const selectedKey = corpusVersion ?? defaultCorpus;
	const cohort = cohorts.find(
		(entry) => (entry.corpusVersion ?? "unrecorded") === selectedKey,
	);
	const figures = cohort?.figures;
	return { cohort, cohorts, figures, selectedKey };
}

interface CohortSelectionReadingProps {
	readonly listed: ListedCase;
	readonly selection: SelectedCohort;
	readonly navigate: ReturnType<typeof useNavigate>;
	readonly rows: RunListingResponse["rows"];
}

function CohortSelectionReading({
	listed,
	selection,
	navigate,
	rows,
}: CohortSelectionReadingProps): React.JSX.Element {
	return (
		<>
			<CohortChoice
				cohorts={selection.cohorts}
				selectedKey={selection.selectedKey}
				cohort={selection.cohort}
				caseId={listed.id}
				navigate={navigate}
			/>
			{selection.cohort === undefined ? (
				<p role="status" className="mt-4 text-14 text-muted-foreground">
					No recorded cohort matches this corpus selection. Choose a recorded
					version.
				</p>
			) : null}
			{selection.figures?.state === "measured" ? (
				<CohortFigures
					listed={listed}
					figures={selection.figures}
					cohorts={selection.cohorts}
				/>
			) : null}
			{selection.cohort === undefined ? null : (
				<CohortMembers
					cohort={selection.cohort}
					kind={listed.kind}
					rows={rows}
				/>
			)}
		</>
	);
}

export { CaseCohorts, EMPTY_COLLECTION_LENGTH };
