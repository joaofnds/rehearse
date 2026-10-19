import {
	corpusMeasurementReading,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import Disclosure from "#client/system/components/disclosure";
import { Status } from "#client/system/components/status";

import isClean from "./clean-record";
import type { HistoryRow } from "./history-table-contract";
import {
	SINGLE_CORPUS_VERSION_DISTANCE,
	SINGLE_ITEM_COUNT,
} from "./history-table-contract";
import { recordIdentity } from "./run-discovery";

type RowStaleness = HistoryRow["staleness"];

type JudgedStaleness = Extract<RowStaleness, { readonly state: "available" }>;

function causeList(causes: readonly string[]): readonly React.JSX.Element[] {
	return causes.map((cause, index) => (
		<span key={index} className="text-12 text-dim">
			{cause}
		</span>
	));
}

function disclosureKeyOf(row: HistoryRow): string {
	return `${row.kind}:${recordIdentity(row)}`;
}

function causesFor(
	row: HistoryRow,
	causes: readonly string[],
): React.ReactNode {
	if (causes.length <= SINGLE_ITEM_COUNT) {
		return causeList(causes);
	}

	return (
		<Disclosure
			key={disclosureKeyOf(row)}
			collapsedLabel={`${causes.length} causes`}
			expandedLabel="hide causes"
		>
			{causeList(causes)}
		</Disclosure>
	);
}

function corpusCell(row: HistoryRow): React.JSX.Element {
	return (
		<span className="flex flex-col items-start gap-0.5">
			{row.corpusVersion?.kind === "version" ? (
				<span className="font-mono text-14 text-secondary-foreground">
					{corpusVersionLabel(row.corpusVersion.digest)}
				</span>
			) : (
				<span className="text-12 text-muted-foreground">
					{corpusMeasurementReading(row.corpusVersion)}
				</span>
			)}
			{row.kind === "run" && row.corpusChangedDuringRun ? (
				<span className="text-12 text-secondary-foreground">
					corpus changed during the run
				</span>
			) : null}
			{corpusState(row, row.staleness)}
		</span>
	);
}

function corpusState(
	row: HistoryRow,
	staleness: RowStaleness,
): React.JSX.Element {
	if (staleness.state === "unavailable") {
		return (
			<span className="text-12 text-muted-foreground">
				{staleness.reasons.join("; ")}
			</span>
		);
	}

	return (
		<>
			{judgment(staleness)}
			{causesFor(row, staleness.causes)}
		</>
	);
}

function judgment(staleness: JudgedStaleness): React.JSX.Element {
	const { distance, onlyCorpusFiles } = staleness;

	if (isClean(staleness)) {
		return (
			<span className="text-12 text-muted-foreground">
				<Status state="clean" />
			</span>
		);
	}
	if (
		distance.kind === "measured" &&
		onlyCorpusFiles &&
		distance.versions === SINGLE_CORPUS_VERSION_DISTANCE
	) {
		return (
			<span className="text-12 text-secondary-foreground">
				<Status state="stale" /> · corpus changed since
			</span>
		);
	}
	if (
		distance.kind === "measured" &&
		onlyCorpusFiles &&
		distance.versions > SINGLE_CORPUS_VERSION_DISTANCE
	) {
		return (
			<span className="text-12 text-secondary-foreground">
				<Status state="superseded" /> · {distance.versions} versions back
			</span>
		);
	}
	if (staleness.stale) {
		return (
			<span className="text-12 text-secondary-foreground">
				<Status state="stale" />
			</span>
		);
	}

	return (
		<span className="text-12 text-muted-foreground">
			<Status state="clear" />
		</span>
	);
}

export { causeList, corpusCell, disclosureKeyOf };
export type { JudgedStaleness };
