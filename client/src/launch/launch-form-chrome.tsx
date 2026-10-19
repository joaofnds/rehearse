import ActionGroup from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";
import { DialogClose, DialogTitle } from "#client/system/ui/dialog";

import { attemptsLabel, ceilingReading } from "./launch-budget";
import { dialogTitle } from "./launch-request";
import type { SettledTarget } from "./launch-target-contract";
import type { LaunchFormModel } from "./use-launch-form";

interface LaunchFormHeaderProps {
	readonly target: SettledTarget;
}

function LaunchFormHeader({
	target,
}: LaunchFormHeaderProps): React.JSX.Element {
	return (
		<header className="flex shrink-0 items-center gap-3 border-b border-divider px-6 py-4">
			<DialogTitle>{dialogTitle(target)}</DialogTitle>
			<span className="ml-auto">
				<DialogClose asChild>
					<Button variant="outline" size="sm" aria-label="Close">
						Esc
					</Button>
				</DialogClose>
			</span>
		</header>
	);
}

interface LaunchFormFooterProps {
	readonly model: LaunchFormModel;
}

function LaunchFormFooter({ model }: LaunchFormFooterProps): React.JSX.Element {
	return (
		<footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-divider px-4 py-3">
			{model.ceilingUsd === undefined ? null : (
				<span className="text-12 text-muted-foreground">
					{ceilingReading(model.ceilingUsd, model.started)}
				</span>
			)}
			<ActionGroup className="ml-auto justify-end">
				<DialogClose asChild>
					<Button variant="outline">Cancel</Button>
				</DialogClose>
				<Button
					variant="primary"
					disabled={!model.startable}
					onClick={model.start}
				>
					{`Start · ${attemptsLabel(model.started.groups * model.started.attempts)}`}
				</Button>
			</ActionGroup>
		</footer>
	);
}

export { LaunchFormFooter, LaunchFormHeader };
