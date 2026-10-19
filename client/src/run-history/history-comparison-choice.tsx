import { LaunchDialog } from "#client/launch/launch-dialog";
import { Button } from "#client/system/ui/button";

import type { HistoryRow } from "./history-table-contract";
import { COMPARISON_ARM_COUNT } from "./history-table-contract";

type GroupRow = Extract<HistoryRow, { readonly kind: "group" }>;

interface ChosenArm {
	readonly groupId: string;
	readonly run: string;
	readonly stage: string;
	readonly reps: number;
}

interface ArmChoice {
	readonly chosen: readonly ChosenArm[];
	readonly onToggle: (arm: ChosenArm) => void;
}

interface CompareChoiceProps {
	readonly row: GroupRow;
	readonly choice: ArmChoice;
}

function CompareChoice({
	row,
	choice,
}: CompareChoiceProps): React.JSX.Element | null {
	const { checkpoint } = row;
	if (row.mode !== "stage" || checkpoint === undefined) {
		return null;
	}
	const { chosen, onToggle } = choice;
	const checked = chosen.some(({ groupId }) => groupId === row.groupId);
	const [first] = chosen;
	const offered =
		checked ||
		first === undefined ||
		(chosen.length < COMPARISON_ARM_COUNT &&
			first.run === checkpoint.run &&
			first.stage === checkpoint.stage);

	return (
		<label className="flex items-center gap-2 text-12 text-dim">
			<input
				type="checkbox"
				aria-label={`Compare ${row.groupId}`}
				checked={checked}
				disabled={!offered}
				onChange={() => {
					onToggle({ groupId: row.groupId, ...checkpoint, reps: row.reps });
				}}
			/>
			compare
		</label>
	);
}

interface ComparisonBarProps {
	readonly chosen: readonly ChosenArm[];
	readonly onClear: () => void;
}

function ComparisonBar({
	chosen,
	onClear,
}: ComparisonBarProps): React.JSX.Element | null {
	const [armA, armB] = chosen;
	if (armA === undefined) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-3 text-14">
			<span className="font-mono">{`Baseline (before) ${armA.groupId}`}</span>
			{armB === undefined ? (
				<span className="text-dim">{`Choose candidate (after), a group replayed at ${armA.stage} · ${armA.run}`}</span>
			) : (
				<>
					<span className="font-mono">{`Candidate (after) ${armB.groupId}`}</span>
					<LaunchDialog
						target={{
							armA: armA.groupId,
							armB: armB.groupId,
							kind: "comparison",
							reps: armA.reps,
							run: armA.run,
							stage: armA.stage,
						}}
						triggerLabel="Compare these attempts"
					/>
				</>
			)}
			<Button variant="outline" size="sm" onClick={onClear}>
				Clear
			</Button>
		</div>
	);
}

export { CompareChoice, ComparisonBar };
export type { ArmChoice, ChosenArm, GroupRow };
