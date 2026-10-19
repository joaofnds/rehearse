import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { LaunchDialog } from "#client/launch/launch-dialog";
import plural from "#client/plural";
import focusWorkspaceTarget from "#client/system/focus-workspace-target";

import type { AppliedCorpusEdit } from "./corpus-edit-requests";
import { Version } from "./corpus-edit-review";
import type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source";

/** The default repetitions offered for a source-step replay. */
const SOURCE_REPLAY_ATTEMPTS = 3;

/** What an apply wrote, and the replay it offers without starting it. */
interface AppliedEditProps {
	readonly path: string;
	readonly applied: AppliedCorpusEdit;
	readonly source: CorpusExperimentSource | undefined;
	readonly evidence: SourceEvidence | undefined;
}

function AppliedEdit({
	path,
	applied,
	source,
	evidence,
}: AppliedEditProps): React.JSX.Element {
	const { rerun } = applied;
	const confirmation = useRef<HTMLParagraphElement>(null);
	useEffect(() => {
		if (confirmation.current !== null) {
			focusWorkspaceTarget(confirmation.current);
		}
	}, []);

	return (
		<div className="flex flex-col gap-2 text-14">
			<p ref={confirmation} tabIndex={-1} className="font-medium wrap-anywhere">
				{`Applied ${path}: `}
				<Version digest={applied.previous} />
				{" → "}
				<Version digest={applied.version} />
			</p>
			<p className="text-muted-foreground">
				{`Marked ${plural(applied.invalidated, "recorded result")} stale, none deleted`}
			</p>
			{source !== undefined && evidence?.replayable === true ? (
				<AppliedSourceReplay source={source} />
			) : (
				<AppliedReplayUnavailable
					source={source}
					evidence={evidence}
					rerun={rerun}
				/>
			)}
			{applied.needsComparisonManifest ? (
				<p className="text-muted-foreground">
					{`${path} lies outside a skill directory, so a browser comparison of this edit will need a comparison manifest to supply its control.`}
				</p>
			) : null}
		</div>
	);
}

interface AppliedSourceReplayProps {
	readonly source: CorpusExperimentSource;
}

function AppliedSourceReplay({
	source,
}: AppliedSourceReplayProps): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<p className="text-muted-foreground">
				{`Replays ${source.stage} of source run ${source.run} from its saved starting checkpoint, against the new version. Nothing starts until you start it.`}
			</p>
			<LaunchDialog
				target={{
					attempts: SOURCE_REPLAY_ATTEMPTS,
					kind: "replay",
					run: source.run,
					stage: source.stage,
				}}
				triggerLabel={`Replay ${source.stage} · ${plural(SOURCE_REPLAY_ATTEMPTS, "attempt")}`}
			/>
		</div>
	);
}

interface AppliedReplayUnavailableProps {
	readonly source: CorpusExperimentSource | undefined;
	readonly evidence: SourceEvidence | undefined;
	readonly rerun: AppliedCorpusEdit["rerun"];
}

function AppliedReplayUnavailable({
	source,
	evidence,
	rerun,
}: AppliedReplayUnavailableProps): React.JSX.Element {
	return (
		<>
			{source === undefined ? (
				<p className="text-muted-foreground">
					<Link to="/" className="text-link underline underline-offset-2">
						Choose a source step in Runs
					</Link>
					{" to test this edit from a saved checkpoint."}
				</p>
			) : (
				<p className="text-muted-foreground">
					{evidence?.reason ??
						"Saved source evidence is loading; replay is unavailable until it can be checked."}
				</p>
			)}
			{rerun.kind === "none" ? (
				<p className="text-muted-foreground">{rerun.reason}</p>
			) : null}
		</>
	);
}

export { AppliedEdit as default };
