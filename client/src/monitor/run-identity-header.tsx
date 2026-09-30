import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import {
	ControlRequests,
	NO_LAUNCH_REASON,
	usePauseRun,
	useStopLaunch,
} from "#client/run-history/run-controls";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { nameOf } from "#client/shell/run-in-flight";
import { CorpusPill } from "#client/system/components/corpus-pill";
import { LiveGlyph } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";
import type { RunRecordResponse } from "./run-record-query";

/** As many of the commit's characters as the design shows. */
const COMMIT_SHOWN = 6;

export function shortCommit(commit: string): string {
	return commit.slice(0, COMMIT_SHOWN);
}

function HeaderControls({
	row,
}: {
	readonly row: PipelineRow;
}): React.JSX.Element {
	const pause = usePauseRun();
	const stop = useStopLaunch();
	const { launchId } = row;

	return (
		<span className="ml-auto flex flex-col items-end gap-1.5">
			<span className="flex gap-2.5">
				<Button
					variant="outline"
					disabled={pause.isPending || pause.isSuccess}
					onClick={() => {
						pause.mutate(row.run);
					}}
				>
					Pause after this step
				</Button>
				{launchId === undefined ? (
					<Button
						variant="outline"
						aria-disabled="true"
						aria-label={NO_LAUNCH_REASON}
						title={NO_LAUNCH_REASON}
					>
						Stop &amp; restore repo
					</Button>
				) : (
					<Button
						variant="outline"
						disabled={stop.isPending || stop.isSuccess}
						onClick={() => {
							stop.mutate(launchId);
						}}
					>
						Stop &amp; restore repo
					</Button>
				)}
			</span>
			<ControlRequests
				pauseRequested={pause.isSuccess}
				stopRequested={stop.isSuccess}
				refusal={(stop.error ?? pause.error)?.message}
			/>
		</span>
	);
}

/**
 * The monitor's first band: which run this is and what it runs against, with
 * the controls that end it. The manifest records no branch, so the target
 * names the commit alone where the design shows `main…e91f2a`.
 */
export function RunIdentityHeader({
	row,
	identity,
}: {
	readonly row: PipelineRow;
	readonly identity: RunRecordResponse["identity"];
}): React.JSX.Element {
	const { corpusVersion } = row;

	return (
		<header className="flex flex-none flex-wrap items-center gap-4.25 border-b border-divider px-6 py-3.75">
			<span className="flex items-center gap-2.75">
				<LiveGlyph />
				<h1 className="text-xl">
					Run <span className="font-mono">{nameOf(row)}</span> in progress
				</h1>
			</span>
			<span className="font-mono text-sm text-secondary-foreground">
				{row.caseId}
			</span>
			{corpusVersion?.kind === "version" ? (
				<CorpusPill hash={corpusVersion.digest} />
			) : (
				<span className="text-sm text-muted-foreground">
					{corpusMeasurementReading(corpusVersion)}
				</span>
			)}
			<span className="text-sm text-dim">
				target{" "}
				<span className="font-mono">
					{identity.target} @ {shortCommit(identity.commit)}
				</span>{" "}
				· {identity.model}
				{identity.effort === undefined ? null : ` · effort ${identity.effort}`}
			</span>
			<HeaderControls row={row} />
		</header>
	);
}
