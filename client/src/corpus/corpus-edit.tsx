import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
	fetchCorpusFileText,
	reviewCorpusEdit,
} from "./corpus-edit-requests";
import { corpusQuery } from "./corpus-query";
import type { DiffLine } from "./line-diff";
import { lineDiff } from "./line-diff";

/** The attempts a paired rerun offers, enough to tell a change from noise. */
const PAIRED_RERUN_ATTEMPTS = 3;

function Version({ digest }: { readonly digest: string }): React.JSX.Element {
	return (
		<span className="font-mono text-pale">{corpusVersionLabel(digest)}</span>
	);
}

const DIFF_MARK = { same: " ", removed: "−", added: "+" } as const;

const DIFF_BACKGROUND = {
	same: "",
	removed: "bg-diff-removed",
	added: "bg-diff-added",
} as const;

function lineNumber(line: DiffLine): number {
	return line.kind === "removed" ? line.before : line.after;
}

/** Each changed line carries its mark as text, so colour is never the only sign. */
function DiffPreview({
	path,
	original,
	text,
}: {
	readonly path: string;
	readonly original: string;
	readonly text: string;
}): React.JSX.Element {
	const lines = lineDiff(original, text);
	if (lines.every(({ kind }) => kind === "same")) {
		return (
			<p className="text-sm text-muted-foreground">
				No change from the version under test yet.
			</p>
		);
	}

	return (
		<ol
			aria-label={`Changes to ${path}`}
			className="overflow-x-auto font-mono text-11-5 leading-relaxed"
		>
			{lines.map((line, index) => (
				<li
					key={index}
					className={`flex gap-2.5 whitespace-pre ${DIFF_BACKGROUND[line.kind]}`}
				>
					<span className="w-7 shrink-0 text-right text-faint">
						{lineNumber(line)}
					</span>
					<span
						className={
							line.kind === "same" ? "text-muted-foreground" : "text-pale"
						}
					>
						{`${DIFF_MARK[line.kind]} ${line.text}`}
						{line.noNewline === true ? " (no newline at end)" : null}
					</span>
				</li>
			))}
		</ol>
	);
}

function ReviewPanel({
	review,
	applyError,
	applying,
	onApply,
}: {
	readonly review: CorpusEditReview;
	readonly applyError: string | undefined;
	readonly applying: boolean;
	readonly onApply: () => void;
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
			{review.applyRefusal === null ? null : (
				<p role="alert" className="mt-2 text-sm text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{review.applyRefusal}
				</p>
			)}
			{applyError === undefined ? null : (
				<p role="alert" className="mt-2 text-sm text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{applyError}
				</p>
			)}
			<div className="mt-3 flex gap-2">
				<Button
					size="sm"
					disabled={review.applyRefusal !== null || applying}
					onClick={onApply}
				>
					Apply
				</Button>
			</div>
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
	const file = useQuery({
		queryKey: ["corpus-file", path],
		queryFn: () => fetchCorpusFileText(path),
		gcTime: 0,
	});
	const [draft, setDraft] = useState<string>();
	const [reviewed, setReviewed] = useState<Reviewed>();
	const review = useMutation({ mutationFn: reviewCorpusEdit });
	const apply = useMutation({
		mutationFn: applyCorpusEdit,
		onSuccess: async (applied) => {
			await queryClient.invalidateQueries({ queryKey: corpusQuery.queryKey });
			onApplied(applied);
		},
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

	const text = draft ?? file.data;
	const current = reviewed?.text === text ? reviewed.review : undefined;

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<div className="flex min-w-0 flex-col gap-3 md:col-span-2">
				<textarea
					aria-label={`Text of ${path}`}
					value={text}
					rows={Math.min(24, Math.max(6, text.split("\n").length + 1))}
					spellCheck={false}
					onChange={(event) => {
						setDraft(event.target.value);
						apply.reset();
					}}
					className="w-full rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-11-5"
				/>
				<DiffPreview path={path} original={file.data} text={text} />
			</div>
			<div>
				<h3>
					<SectionLabel>Review before apply</SectionLabel>
				</h3>
				{current === undefined ? (
					<>
						{review.isError ? (
							<p
								role="alert"
								className="mt-2 text-sm text-secondary-foreground"
							>
								<span aria-hidden="true">⚠ </span>
								{review.error.message}
							</p>
						) : null}
						<div className="mt-3 flex gap-2">
							<Button
								size="sm"
								disabled={review.isPending}
								onClick={() => {
									review.mutate(
										{ path, text },
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
						</div>
					</>
				) : (
					<ReviewPanel
						review={current}
						applyError={apply.isError ? apply.error.message : undefined}
						applying={apply.isPending}
						onApply={() => {
							apply.mutate({ path, text, startsFrom: current.startsFrom });
						}}
					/>
				)}
				<div className="mt-2 flex gap-2">
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
