import DeclareCaseDialog from "#client/cases/declare-case-dialog";
import ActionGroup from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";

import { SetupStep, StepProse } from "./setup-step";

const NOTHING_HINT = "Choose a spend limit and scan a corpus directory.";

const NO_LIMIT_HINT = "Set a spend limit.";

const NO_CORPUS_HINT = "Scan a corpus directory.";

/** Worded so it claims nothing stored before Finish writes the limit. */
const READY_HINT = "A corpus is linked. Finish setup records the spend limit.";

/** What Finish setup still waits on, or that it waits on nothing. */
function finishHint(limitEntered: boolean, linked: boolean): string {
	if (!limitEntered) {
		return linked ? NO_LIMIT_HINT : NOTHING_HINT;
	}

	return linked ? READY_HINT : NO_CORPUS_HINT;
}

interface SetupCaseStepProps {
	readonly linked: boolean;
	readonly declaredPath: string | undefined;
	readonly setDeclaredPath: (path: string) => void;
}

function SetupCaseStep({
	linked,
	declaredPath,
	setDeclaredPath,
}: SetupCaseStepProps): React.JSX.Element {
	return (
		<SetupStep
			number={3}
			title="Declare your first case"
			state={linked ? "Open" : "Locked"}
			look={linked ? "open" : "locked"}
		>
			<StepProse>
				{linked ? "" : "Unlocks once a corpus is linked. "}Two kinds: a
				multi-step task against a target repository, or a single agent session
				judged by deterministic checks.
			</StepProse>
			{linked ? (
				<div className="mt-3 flex flex-col items-start gap-2">
					<DeclareCaseDialog onDeclared={setDeclaredPath} />
					{declaredPath === undefined ? null : (
						<p
							role="status"
							className="text-12 text-muted-foreground wrap-anywhere"
						>
							{`Declared ${declaredPath}. It is uncommitted: review and commit it to keep the case.`}
						</p>
					)}
				</div>
			) : null}
		</SetupStep>
	);
}

interface SetupFinishActionsProps {
	readonly limitEntered: boolean;
	readonly linked: boolean;
	readonly pending: boolean;
	readonly usd: number | undefined;
	readonly onFinish: (usd: number) => void;
}

function SetupFinishActions({
	limitEntered,
	linked,
	pending,
	usd,
	onFinish,
}: SetupFinishActionsProps): React.JSX.Element {
	return (
		<ActionGroup className="mt-5">
			<Button
				variant="primary"
				disabled={!limitEntered || !linked || pending}
				onClick={() => {
					if (usd !== undefined) {
						onFinish(usd);
					}
				}}
			>
				Finish setup
			</Button>
			<span className="text-12 text-dim">
				{finishHint(limitEntered, linked)}
			</span>
		</ActionGroup>
	);
}

export { SetupCaseStep, SetupFinishActions };
