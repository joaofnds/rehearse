import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import plural from "#client/plural";
import SectionLabel from "#client/system/components/section-label";
import { Button } from "#client/system/ui/button";

import type {
	CorpusEditReview,
	OpenedCorpusFile,
} from "./corpus-edit-requests";
import type { CorpusEditingActions } from "./use-corpus-editing";

interface VersionProps {
	readonly digest: string;
}

function Version({ digest }: VersionProps): React.JSX.Element {
	return (
		<span className="font-mono text-pale">{corpusVersionLabel(digest)}</span>
	);
}

interface RefusalProps {
	readonly reason: string;
}

function Refusal({ reason }: RefusalProps): React.JSX.Element {
	return (
		<p role="alert" className="mt-2 text-14 text-attention">
			<span aria-hidden="true">⚠ </span>
			{reason}
		</p>
	);
}

/** What applying would do, read before anything is written. */
interface ReviewSummaryProps {
	readonly review: CorpusEditReview;
	readonly hasReplayableSource: boolean;
}

function ReviewSummary({
	review,
	hasReplayableSource,
}: ReviewSummaryProps): React.JSX.Element {
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

interface CorpusReviewPanelProps {
	readonly path: string;
	readonly hasReplayableSource: boolean;
	readonly model: CorpusEditingActions;
	readonly file: OpenedCorpusFile;
}

function CorpusReviewPanel({
	path,
	hasReplayableSource,
	model,
	file,
}: CorpusReviewPanelProps): React.JSX.Element {
	return (
		<div>
			<h3>
				<SectionLabel>Review before apply</SectionLabel>
			</h3>
			{model.current === undefined ? null : (
				<ReviewSummary
					review={model.current}
					hasReplayableSource={hasReplayableSource}
				/>
			)}
			{model.reviewFailure === undefined ? null : (
				<Refusal reason={model.reviewFailure} />
			)}
			{model.applyFailure === undefined ? null : (
				<Refusal reason={model.applyFailure} />
			)}
			<div className="mt-3 flex gap-2">
				{model.current === undefined ? (
					<ReviewCorpusButton path={path} model={model} file={file} />
				) : (
					<ApplyCorpusButton
						path={path}
						current={model.current}
						model={model}
					/>
				)}
				<Button
					size="sm"
					variant="outline"
					onClick={() => {
						model.discardDraft();
						model.onDiscard();
					}}
				>
					Discard
				</Button>
			</div>
		</div>
	);
}

interface ReviewCorpusButtonProps {
	readonly path: string;
	readonly model: CorpusEditingActions;
	readonly file: OpenedCorpusFile;
}

function ReviewCorpusButton({
	path,
	model,
	file,
}: ReviewCorpusButtonProps): React.JSX.Element {
	return (
		<Button
			variant="primary"
			size="sm"
			disabled={model.review.isPending}
			onClick={() => {
				model.apply.reset();
				model.review.mutate(
					{ path, startsFrom: file.version, text: model.text },
					{
						onSuccess: (answer) => {
							model.setReviewed({ review: answer, text: model.text });
						},
					},
				);
			}}
		>
			Review
		</Button>
	);
}

interface ApplyCorpusButtonProps {
	readonly path: string;
	readonly current: CorpusEditReview;
	readonly model: CorpusEditingActions;
}

function ApplyCorpusButton({
	path,
	current,
	model,
}: ApplyCorpusButtonProps): React.JSX.Element {
	return (
		<Button
			variant="primary"
			size="sm"
			disabled={current.applyRefusal !== null || model.apply.isPending}
			onClick={() => {
				model.apply.mutate({
					path,
					startsFrom: current.startsFrom,
					text: model.text,
				});
			}}
		>
			Apply
		</Button>
	);
}

export { CorpusReviewPanel, Version };
