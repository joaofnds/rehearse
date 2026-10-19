import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";

import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { WhatWentIn } from "./step-inputs";
import WhatCameOut from "./step-output";
import {
	GradeReading,
	STEP_NUMBER_DIGITS,
	figuresReading,
	verdictReading,
} from "./step-record-readings";

interface ModalHeaderProps {
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly record: RunRecordResponse;
}

function ModalHeader({
	stage,
	number,
	record,
}: ModalHeaderProps): React.JSX.Element {
	return (
		<header className="flex flex-none flex-wrap items-center gap-3 border-b border-strong px-4 py-3">
			<span className="font-mono text-12 tracking-label text-dim uppercase">
				Step {String(number).padStart(STEP_NUMBER_DIGITS, "0")}
			</span>
			<DialogTitle>{stage.stage}</DialogTitle>
			<span className="font-mono text-12 text-muted-foreground">
				{figuresReading(stage)}
			</span>
			<span className="ml-auto flex items-center gap-2.25">
				<span className="text-12 text-secondary-foreground">
					verdict {verdictReading(stage, record)}
				</span>{" "}
				<GradeReading stage={stage} />
				<DialogClose asChild>
					<Button variant="outline" size="sm" aria-label="Close">
						Esc
					</Button>
				</DialogClose>
			</span>
		</header>
	);
}

/**
 * The selected step's Inputs & output action and its modal:
 * what went into the stage, what came out, its judge, and the
 * operations on it.
 */
interface StepModalActionProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly number: number;
}

function StepModalAction({
	run,
	record,
	stage,
	number,
}: StepModalActionProps): React.JSX.Element {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="quiet" size="xs">
					Inputs &amp; output
				</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<ModalHeader stage={stage} number={number} record={record} />
				<div className="relative grid min-h-0 flex-1 grid-cols-1 gap-4.5 overflow-y-auto overscroll-y-contain px-4 py-3.5 lg:grid-cols-2">
					<WhatWentIn record={record} stage={stage} />
					<WhatCameOut run={run} record={record} stage={stage} />
				</div>
			</DialogContent>
		</Dialog>
	);
}

export { StepModalAction as default };
