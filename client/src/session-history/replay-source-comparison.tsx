import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { runRecordQuery } from "#client/monitor/run-record-query";
import { stageOutputQuery } from "#client/run-detail/investigation-query";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";

import attemptEvidenceQuery from "./attempt-evidence-query";
import type { ReplayRow } from "./replay-source-readings";
import { ReplayReading, SourceRunReading } from "./replay-source-readings";

interface SourceComparisonContentProps {
	readonly sourceRun: string;
	readonly row: ReplayRow;
}

function SourceComparisonContent({
	sourceRun,
	row,
}: SourceComparisonContentProps): React.JSX.Element {
	const source = useQuery(runRecordQuery(sourceRun));
	const output = useQuery(stageOutputQuery(sourceRun, row.stage));
	const replay = useQuery(attemptEvidenceQuery(row.recordId));
	const replayOutput =
		replay.data?.state === "available" && replay.data.kind === "stage"
			? replay.data.output
			: undefined;
	return (
		<div className="min-h-0 overflow-y-auto px-4 pb-4">
			<p className="mb-4 text-14 text-dim">
				One original execution and one replay from its checkpoint. This
				exploratory comparison has no control or repeated sample; it cannot
				attribute a difference to the corpus or establish equivalent quality.
				Source cost covers the selected worker and step Judge. Replay total also
				includes the Product Owner; its recorded parts are listed below.
			</p>
			<div className="grid items-start gap-4 lg:grid-cols-2">
				<SourceRunReading
					source={source}
					output={output}
					sourceRun={sourceRun}
					row={row}
				/>
				<ReplayReading
					row={row}
					replayOutput={replayOutput}
					pending={replay.isPending}
				/>
			</div>
		</div>
	);
}

interface ReplaySourceComparisonProps {
	readonly sourceRun: string;
	readonly row: ReplayRow;
}

function ReplaySourceComparison({
	sourceRun,
	row,
}: ReplaySourceComparisonProps): React.JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">Compare with source</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<div className="flex items-start justify-between gap-4 p-4">
					<div>
						<DialogTitle>Source & replay · exploratory</DialogTitle>
						<DialogDescription>
							Compare this saved replay with the original {row.stage} step.
						</DialogDescription>
					</div>
					<DialogClose asChild>
						<Button size="sm" variant="quiet">
							Close
						</Button>
					</DialogClose>
				</div>
				{open ? (
					<SourceComparisonContent sourceRun={sourceRun} row={row} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}

export { ReplaySourceComparison as default };
