import { useState } from "react";

import useKeyShortcut from "#client/shell/use-key-shortcut";
import KeyHint from "#client/system/components/key-hint";
import { Button } from "#client/system/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "#client/system/ui/dialog";

import LaunchForm from "./launch-form";
import ReplayChoiceRows from "./launch-replay-choice";
import type {
	LaunchTarget,
	ReplayChoice,
	ReplayableRun,
} from "./launch-target-contract";

/**
 * A replay whose run and step the operator picks. A choice whose run a later
 * read no longer offers falls back to the opening one, so the form never
 * starts a run its Run field does not show.
 */
interface ChosenReplayFormProps {
	readonly runs: readonly ReplayableRun[];
	readonly opensOn: ReplayChoice;
	readonly onLaunched: () => void;
}

function ChosenReplayForm({
	runs,
	opensOn,
	onLaunched,
}: ChosenReplayFormProps): React.JSX.Element {
	const [picked, setPicked] = useState(opensOn);
	const chosen = runs.some(({ run }) => run === picked.run) ? picked : opensOn;

	return (
		<LaunchForm
			target={{ kind: "replay", run: chosen.run, stage: chosen.stage }}
			targetRows={
				<ReplayChoiceRows runs={runs} chosen={chosen} onChoose={setPicked} />
			}
			onLaunched={onLaunched}
		/>
	);
}

/**
 * The run-launch dialog (SPEC.md:355): starts a declared case, or replays one
 * recorded stage, as one run or a group of attempts under the stored spend
 * ceiling. The spend field edits the stored ceiling itself, not a per-launch
 * override, so the server and the CLI hold every later run to what it stores.
 */
function LaunchDialog({
	target,
	shortcut,
	...opener
}: LaunchDialogProps): React.JSX.Element {
	const [open, setOpen] = useState(false);
	const close = (): void => {
		setOpen(false);
	};
	useKeyShortcut(shortcut, () => {
		setOpen(true);
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{opener.trigger ?? (
					<Button
						variant={target.kind === "case" ? "primary" : "outline"}
						aria-keyshortcuts={shortcut}
					>
						{opener.triggerLabel}
						{shortcut === undefined ? null : <KeyHint letter={shortcut} />}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent width="wide">
				{target.kind === "chosen-replay" ? (
					<ChosenReplayForm
						runs={target.runs}
						opensOn={target.opensOn}
						onLaunched={close}
					/>
				) : (
					<LaunchForm target={target} onLaunched={close} />
				)}
			</DialogContent>
		</Dialog>
	);
}

type LaunchDialogProps = {
	readonly target: LaunchTarget;
	/** The key that opens the dialog from anywhere on the page, shown on the trigger. */
	readonly shortcut?: string;
} & (
	| { readonly triggerLabel: string; readonly trigger?: undefined }
	| { readonly trigger: React.ReactNode; readonly triggerLabel?: undefined }
);

export { LAUNCH_CASES_QUERY_KEY } from "./launch-case-list";
export type {
	LaunchTarget,
	ReplayChoice,
	ReplayableRun,
} from "./launch-target-contract";
export { LaunchDialog };
