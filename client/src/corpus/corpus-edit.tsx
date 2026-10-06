import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { plural } from "#client/plural";
import { SectionLabel } from "#client/system/components/section-label";
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
import { DiffPreview } from "./diff-preview";

/** The attempts a paired rerun offers, enough to tell a change from noise. */
const PAIRED_RERUN_ATTEMPTS = 3;

function Version({ digest }: { readonly digest: string }): React.JSX.Element {
	return (
		<span className="font-mono text-pale">{corpusVersionLabel(digest)}</span>
	);
}

function Refusal({ reason }: { readonly reason: string }): React.JSX.Element {
	return (
		<p role="alert" className="mt-2 text-sm text-secondary-foreground">
			<span aria-hidden="true">⚠ </span>
			{reason}
		</p>
	);
}

/** What applying would do, read before anything is written. */
function ReviewSummary({
	review,
}: {
	readonly review: CorpusEditReview;
}): React.JSX.Element {
	return (
		<>
			<p className="mt-2 text-sm">
				Starts from <Version digest={review.startsFrom} />
			</p>
			<ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
				<li>Writes a new corpus version, keeps the old one addressable</li>
				<li>
					{`Marks ${plural(review.invalidated, "recorded result")} stale, none deleted`}
				</li>
				<li>Offers the paired rerun that would settle it</li>
			</ul>
			<p className="mt-2 text-xs text-muted-foreground">
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

/**
 * The unapplied edit lives in this component only, so leaving the screen or
 * choosing another file drops it and writes nothing.
 */
export function CorpusEditor({
	path,
	onDiscard,
	onApplied,
}: {
	readonly path: string;
	readonly onDiscard: () => void;
	readonly onApplied: (applied: AppliedCorpusEdit) => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const textId = useId();
	const file = useQuery({
		queryKey: ["corpus-file", path],
		queryFn: () => fetchCorpusFile(path),
		gcTime: 0,
	});
	const [draft, setDraft] = useState<string>();
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
			onApplied(applied);
		},
		onError: reopen,
	});

	if (!file.isSuccess) {
		return (
			<p
				role={file.isError ? "alert" : undefined}
				className="text-sm text-muted-foreground"
			>
				{file.isError
					? `Could not read ${path}: ${file.error.message}`
					: "Loading…"}
			</p>
		);
	}

	const text = draft ?? file.data.text;
	const current = reviewed?.text === text ? reviewed.review : undefined;

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<div className="flex min-w-0 flex-col gap-3 md:col-span-2">
				<label htmlFor={textId} className="text-sm">
					{"Text of "}
					<span className="font-mono">{path}</span>
				</label>
				<textarea
					id={textId}
					value={text}
					rows={Math.min(24, Math.max(6, text.split("\n").length + 1))}
					spellCheck={false}
					onChange={(event) => {
						setDraft(event.target.value);
						apply.reset();
					}}
					className="w-full rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-11-5"
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
				{current === undefined ? null : <ReviewSummary review={current} />}
				{review.isError ? <Refusal reason={review.error.message} /> : null}
				{apply.isError ? <Refusal reason={apply.error.message} /> : null}
				<div className="mt-3 flex gap-2">
					{current === undefined ? (
						<Button
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
							size="sm"
							disabled={current.applyRefusal !== null || apply.isPending}
							onClick={() => {
								apply.mutate({ path, text, startsFrom: current.startsFrom });
							}}
						>
							Apply
						</Button>
					)}
					<Button size="sm" variant="outline" onClick={onDiscard}>
						Discard
					</Button>
				</div>
			</div>
		</div>
	);
}

/** What an apply wrote, and the paired rerun it asks for, which it never starts. */
export function AppliedEdit({
	path,
	applied,
}: {
	readonly path: string;
	readonly applied: AppliedCorpusEdit;
}): React.JSX.Element {
	const { rerun } = applied;

	return (
		<div className="flex flex-col gap-2 text-sm">
			<p>
				{`Applied ${path}: `}
				<Version digest={applied.previous} />
				{" → "}
				<Version digest={applied.version} />
			</p>
			<p className="text-muted-foreground">
				{`Marked ${plural(applied.invalidated, "recorded result")} stale, none deleted`}
			</p>
			{rerun.kind === "offered" ? (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-muted-foreground">
						{`Replays ${rerun.stage} of run ${rerun.run} from the checkpoint it read, against the new version. Nothing starts until you start it.`}
					</p>
					<LaunchDialog
						target={{
							kind: "replay",
							run: rerun.run,
							stage: rerun.stage,
							attempts: PAIRED_RERUN_ATTEMPTS,
						}}
						triggerLabel={`Replay ${rerun.stage} · ${plural(PAIRED_RERUN_ATTEMPTS, "attempt")}`}
					/>
				</div>
			) : (
				<p className="text-muted-foreground">{rerun.reason}</p>
			)}
			{applied.needsComparisonManifest ? (
				<p className="text-muted-foreground">
					{`${path} lies outside a skill directory, so a browser comparison of this edit will need a comparison manifest to supply its control.`}
				</p>
			) : null}
		</div>
	);
}
