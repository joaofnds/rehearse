import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { plural } from "#client/plural";
import { SectionLabel } from "#client/system/components/section-label";
import { focusWorkspaceTarget } from "#client/system/focus-workspace-target";
import { Button } from "#client/system/ui/button";
import type {
	AppliedCorpusEdit,
	CorpusEditReview,
} from "./corpus-edit-requests";
import {
	applyCorpusEdit,
	fetchCorpusFile,
	reviewCorpusEdit,
} from "./corpus-edit-requests";
import { corpusQuery } from "./corpus-query";
import { useCorpusDraft } from "./corpus-draft";
import { DiffPreview } from "./diff-preview";
import { lineRangeOffsets } from "./line-range";
import type { LineRange } from "./line-range";
import type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source";

/** The default repetitions offered for a source-step replay. */
const SOURCE_REPLAY_ATTEMPTS = 3;

function Version({ digest }: { readonly digest: string }): React.JSX.Element {
	return (
		<span className="font-mono text-pale">{corpusVersionLabel(digest)}</span>
	);
}

function Refusal({ reason }: { readonly reason: string }): React.JSX.Element {
	return (
		<p role="alert" className="mt-2 text-14 text-attention">
			<span aria-hidden="true">⚠ </span>
			{reason}
		</p>
	);
}

/** What applying would do, read before anything is written. */
function ReviewSummary({
	review,
	hasReplayableSource,
}: {
	readonly review: CorpusEditReview;
	readonly hasReplayableSource: boolean;
}): React.JSX.Element {
	return (
		<>
			<p className="mt-2 text-14">
				Starts from <Version digest={review.startsFrom} />
			</p>
			<ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-14 text-muted-foreground">
				<li>Writes a new corpus version, keeps the old one addressable</li>
				<li>
					{`Marks ${plural(review.invalidated, "recorded result")} stale, none deleted`}
				</li>
				<li>
					{hasReplayableSource
						? "Offers a replay of the selected source step after apply"
						: "Choose a source step in Runs after apply to test the change"}
				</li>
			</ul>
			<p className="mt-2 text-12 text-muted-foreground">
				Apply refuses while a launch this server started runs. A replay started
				from a terminal is not seen, so an apply during one records a version
				its session did not read.
			</p>
			{review.applyRefusal === null ? null : (
				<Refusal reason={review.applyRefusal} />
			)}
		</>
	);
}

interface Reviewed {
	readonly text: string;
	readonly review: CorpusEditReview;
}

export function CorpusEditor({
	path,
	root,
	source,
	lines,
	hasReplayableSource,
	onDiscard,
	onApplied,
}: {
	readonly path: string;
	readonly root: string;
	readonly source: CorpusExperimentSource | undefined;
	/** The lines selected once the text opens, where a link named them. */
	readonly lines?: LineRange | undefined;
	readonly hasReplayableSource: boolean;
	readonly onDiscard: () => void;
	readonly onApplied: (applied: AppliedCorpusEdit) => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const textId = useId();
	const file = useQuery({
		queryKey: ["corpus-file", root, path],
		queryFn: () => fetchCorpusFile(path),
		gcTime: 0,
		refetchOnMount: "always",
	});
	const {
		draft,
		save: saveDraft,
		discard: discardDraft,
		recovered,
	} = useCorpusDraft(root, path, source);
	const field = useRef<HTMLTextAreaElement>(null);
	const linesSelected = useRef(false);
	useEffect(() => {
		const element = field.current;
		if (element !== null && lines !== undefined && !linesSelected.current) {
			linesSelected.current = true;
			const { start, end } = lineRangeOffsets(element.value, lines);
			element.setSelectionRange(start, end);
		}
	}, [file.isSuccess, lines]);
	const [reviewed, setReviewed] = useState<Reviewed>();
	/**
	 * A refusal can mean the file changed since it was opened, so it is read
	 * again, the diff shows the edit against what the directory now holds, and
	 * the edit waits for a new review.
	 */
	const reopen = (): void => {
		setReviewed(undefined);
		void file.refetch();
	};
	const review = useMutation({
		mutationFn: reviewCorpusEdit,
		onError: reopen,
	});
	const apply = useMutation({
		mutationFn: applyCorpusEdit,
		onSuccess: async (applied) => {
			await queryClient.invalidateQueries({ queryKey: corpusQuery.queryKey });
			discardDraft();
			onApplied(applied);
		},
		onError: reopen,
	});

	if (!file.isSuccess) {
		return (
			<p
				role={file.isError ? "alert" : undefined}
				className={`text-14 ${file.isError ? "text-attention" : "text-muted-foreground"}`}
			>
				{file.isError
					? `Could not read ${path}: ${file.error.message}`
					: "Loading…"}
			</p>
		);
	}

	const text = draft?.text ?? file.data.text;
	const current = reviewed?.text === text ? reviewed.review : undefined;

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<div className="flex min-w-0 flex-col gap-3 md:col-span-2">
				<p className="text-12 text-dim">
					Unapplied drafts stay in this app session while you navigate. Discard
					removes this draft; reloading the app clears all drafts.
				</p>
				{recovered && draft !== null ? (
					<p role="status" className="text-12 text-pale">
						Recovered an unapplied draft from this app session. The current file
						has been read again; review the diff before applying.
					</p>
				) : null}
				{draft !== null && draft.version !== file.data.version ? (
					<p role="status" className="text-12 text-muted-foreground">
						The corpus changed since this draft began. The diff compares your
						draft with the current file.
					</p>
				) : null}
				<label htmlFor={textId} className="text-14">
					{"Text of "}
					<span className="font-mono">{path}</span>
				</label>
				<textarea
					ref={field}
					id={textId}
					value={text}
					rows={Math.min(24, Math.max(6, text.split("\n").length + 1))}
					spellCheck={false}
					// Put the cursor in the selected file after Edit.
					autoFocus
					onChange={(event) => {
						saveDraft(event.target.value, draft?.version ?? file.data.version);
						apply.reset();
					}}
					className="w-full rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-13 leading-transcript"
				/>
				<DiffPreview
					path={path}
					original={file.data.text}
					text={text}
					unchanged="No change from the version under test yet."
				/>
			</div>
			<div>
				<h3>
					<SectionLabel>Review before apply</SectionLabel>
				</h3>
				{current === undefined ? null : (
					<ReviewSummary
						review={current}
						hasReplayableSource={hasReplayableSource}
					/>
				)}
				{review.isError ? <Refusal reason={review.error.message} /> : null}
				{apply.isError ? <Refusal reason={apply.error.message} /> : null}
				<div className="mt-3 flex gap-2">
					{current === undefined ? (
						<Button
							variant="primary"
							size="sm"
							disabled={review.isPending}
							onClick={() => {
								apply.reset();
								review.mutate(
									{ path, text, startsFrom: file.data.version },
									{
										onSuccess: (answer) => {
											setReviewed({ text, review: answer });
										},
									},
								);
							}}
						>
							Review
						</Button>
					) : (
						<Button
							variant="primary"
							size="sm"
							disabled={current.applyRefusal !== null || apply.isPending}
							onClick={() => {
								apply.mutate({ path, text, startsFrom: current.startsFrom });
							}}
						>
							Apply
						</Button>
					)}
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							discardDraft();
							onDiscard();
						}}
					>
						Discard
					</Button>
				</div>
			</div>
		</div>
	);
}

/** What an apply wrote, and the replay it offers without starting it. */
export function AppliedEdit({
	path,
	applied,
	source,
	evidence,
}: {
	readonly path: string;
	readonly applied: AppliedCorpusEdit;
	readonly source: CorpusExperimentSource | undefined;
	readonly evidence: SourceEvidence | undefined;
}): React.JSX.Element {
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
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-muted-foreground">
						{`Replays ${source.stage} of source run ${source.run} from its saved starting checkpoint, against the new version. Nothing starts until you start it.`}
					</p>
					<LaunchDialog
						target={{
							kind: "replay",
							run: source.run,
							stage: source.stage,
							attempts: SOURCE_REPLAY_ATTEMPTS,
						}}
						triggerLabel={`Replay ${source.stage} · ${plural(SOURCE_REPLAY_ATTEMPTS, "attempt")}`}
					/>
				</div>
			) : (
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
			)}
			{applied.needsComparisonManifest ? (
				<p className="text-muted-foreground">
					{`${path} lies outside a skill directory, so a browser comparison of this edit will need a comparison manifest to supply its control.`}
				</p>
			) : null}
		</div>
	);
}
