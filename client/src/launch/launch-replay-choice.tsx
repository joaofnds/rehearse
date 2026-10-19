import NativeSelect from "#client/system/ui/native-select";

import { CorpusLine } from "./launch-case-list";
import type { ReplayChoice, ReplayableRun } from "./launch-target-contract";

interface ReplayChoiceRowsProps {
	readonly runs: readonly ReplayableRun[];
	readonly chosen: ReplayChoice;
	readonly onChoose: (choice: ReplayChoice) => void;
}

function ReplayChoiceRows({
	runs,
	chosen,
	onChoose,
}: ReplayChoiceRowsProps): React.JSX.Element {
	const stages = runs.find(({ run }) => run === chosen.run)?.stages ?? [];

	return (
		<>
			<dt className="text-muted-foreground">
				<label htmlFor="launch-replay-run">Run</label>
			</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<ReplayRunChoice runs={runs} chosen={chosen} onChoose={onChoose} />
			</dd>
			<dt className="text-muted-foreground">
				<label htmlFor="launch-replay-stage">Step</label>
			</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<ReplayStageChoice
					stages={stages}
					chosen={chosen}
					onChoose={onChoose}
				/>
			</dd>
			<dt className="text-muted-foreground">Corpus</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<CorpusLine />
			</dd>
		</>
	);
}

interface ReplayRunChoiceProps {
	readonly runs: readonly ReplayableRun[];
	readonly chosen: ReplayChoice;
	readonly onChoose: ReplayChoiceRowsProps["onChoose"];
}

function ReplayRunChoice({
	runs,
	chosen,
	onChoose,
}: ReplayRunChoiceProps): React.JSX.Element {
	return (
		<NativeSelect
			id="launch-replay-run"
			value={chosen.run}
			onChange={(event) => {
				const picked = runs.find(({ run }) => run === event.target.value);
				if (picked !== undefined) {
					onChoose({ run: picked.run, stage: picked.openingStage });
				}
			}}
		>
			{runs.map(({ run, caseId }) => (
				<option key={run} value={run}>
					{caseId === undefined ? run : `${run} · ${caseId}`}
				</option>
			))}
		</NativeSelect>
	);
}

interface ReplayStageChoiceProps {
	readonly stages: readonly string[];
	readonly chosen: ReplayChoice;
	readonly onChoose: ReplayChoiceRowsProps["onChoose"];
}

function ReplayStageChoice({
	stages,
	chosen,
	onChoose,
}: ReplayStageChoiceProps): React.JSX.Element {
	return (
		<NativeSelect
			id="launch-replay-stage"
			value={chosen.stage}
			onChange={(event) => {
				onChoose({ run: chosen.run, stage: event.target.value });
			}}
		>
			{stages.map((stage) => (
				<option key={stage} value={stage}>
					{stage}
				</option>
			))}
		</NativeSelect>
	);
}

export { ReplayChoiceRows as default };
