import { useQuery } from "@tanstack/react-query";

import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { launchClient } from "#client/api-client";
import { corpusQuery } from "#client/corpus/corpus-query";
import refusalReason from "#client/refusal-reason";
import Notice from "#client/system/components/notice";
import NativeSelect from "#client/system/ui/native-select";

import type { CaseListing, CasesResponse } from "./launch-target-contract";
import { LaunchRefusedError } from "./post-launch";
import type { LaunchFormModel } from "./use-launch-form";

const EMPTY_COLLECTION_LENGTH = 0;

/** The launch dialog's case list, which a newly declared case makes stale. */
const LAUNCH_CASES_QUERY_KEY = ["launch-cases"] as const;

async function fetchCases(): Promise<CasesResponse> {
	const response = await launchClient.api.cases.$get();
	if (!response.ok) {
		throw new LaunchRefusedError(await refusalReason(response));
	}

	return await response.json();
}

function CorpusLine(): React.JSX.Element {
	const corpus = useQuery(corpusQuery);
	if (corpus.data === undefined) {
		return (
			<span
				className={corpus.isError ? "text-attention" : "text-muted-foreground"}
			>
				{corpus.isError ? "could not read the corpus" : "reading…"}
			</span>
		);
	}

	return corpus.data.digest === undefined ? (
		<span className="font-mono text-attention">
			<span aria-hidden="true">⚠ </span>
			digest withheld
		</span>
	) : (
		<span className="font-mono text-pale">
			{corpusVersionLabel(corpus.data.digest)}
			<span className="ml-2 text-12 text-muted-foreground">
				current linked corpus
			</span>
		</span>
	);
}

interface CasePickerProps {
	readonly cases: readonly CaseListing[];
	readonly selected: string | undefined;
	readonly onSelect: (caseId: string) => void;
}

function CasePicker({
	cases,
	selected,
	onSelect,
}: CasePickerProps): React.JSX.Element {
	return (
		<NativeSelect
			id="launch-case"
			value={selected ?? ""}
			onChange={(event) => {
				onSelect(event.target.value);
			}}
		>
			{cases.map((listed) =>
				listed.model === null ? (
					<option key={listed.id} value={listed.id} disabled>
						{`${listed.id} · declares no model`}
					</option>
				) : (
					<option key={listed.id} value={listed.id}>
						{`${listed.id} · ${listed.title}`}
					</option>
				),
			)}
		</NativeSelect>
	);
}

/** Why the picker offers fewer cases than are declared, if it does. */
interface CaseListProblemsProps {
	readonly failure: string | undefined;
	readonly listing:
		| {
				readonly unreadable: readonly {
					readonly id: string;
					readonly reason: string;
				}[];
		  }
		| undefined;
}

function CaseListProblems({
	failure,
	listing,
}: CaseListProblemsProps): React.JSX.Element | null {
	if (failure !== undefined) {
		return (
			<p role="alert" className="text-14 text-attention">
				<span aria-hidden="true">⚠ </span>
				{failure}
			</p>
		);
	}
	const unreadable = listing?.unreadable ?? [];
	if (unreadable.length === EMPTY_COLLECTION_LENGTH) {
		return null;
	}

	return (
		<Notice
			message="These cases cannot be read, so they are not offered:"
			items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
		/>
	);
}

interface LaunchReadinessNotesProps {
	readonly model: LaunchFormModel;
}

function LaunchReadinessNotes({
	model,
}: LaunchReadinessNotesProps): React.JSX.Element {
	return (
		<>
			<CaseListProblems
				failure={model.casesFailure}
				listing={model.cases.data}
			/>
			{model.settings.data !== undefined && model.ceilingUsd === undefined ? (
				<Notice
					message="No spend ceiling is saved. Save a default above before starting, or set it in a terminal with:"
					items={[model.settings.data.setCommand]}
				/>
			) : null}
			{model.settings.isError ? (
				<p role="alert" className="text-14 text-attention">
					<span aria-hidden="true">⚠ </span>
					{model.settingsFailure}
				</p>
			) : null}
		</>
	);
}

export {
	CasePicker,
	CorpusLine,
	fetchCases,
	LAUNCH_CASES_QUERY_KEY,
	LaunchReadinessNotes,
};
