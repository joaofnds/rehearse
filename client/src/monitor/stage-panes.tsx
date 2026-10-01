import { STATUS_VOCABULARY } from "#client/system/components/status";

/** What a pane does not show yet, as the design's pending verdict reads. */
function NotShownYet({
	words,
	className,
}: {
	readonly words: string;
	readonly className: string;
}): React.JSX.Element {
	return (
		<div className={className}>
			<p className="flex items-center gap-2.25">
				<span aria-hidden="true" className="text-11 text-dim">
					{STATUS_VOCABULARY.pending.glyph}
				</span>
				<span className="text-13 text-secondary-foreground">{words}</span>
			</p>
		</div>
	);
}

/**
 * The session and judge panes (SPEC.md 2d), named after the stage they
 * follow. Their contents are ACT-270.3's and ACT-270.4's.
 */
export function StagePanes({
	number,
	stage,
}: {
	readonly number: number;
	readonly stage: string;
}): React.JSX.Element {
	return (
		<div className="grid min-h-70.75 flex-1 basis-2/5 grid-cols-monitor-panes overflow-x-auto">
			<section
				aria-label="Live agent session"
				className="flex min-h-0 flex-col border-r border-divider"
			>
				<div className="flex flex-none items-center gap-3 border-b border-divider px-4.25 py-2.75">
					<h2 className="text-12 font-medium tracking-caps text-muted-foreground uppercase">
						Step {String(number)} · {stage}
					</h2>
				</div>
				<NotShownYet
					words="This pane does not show the session's transcript yet."
					className="flex-1 overflow-y-auto px-4.25 py-3"
				/>
			</section>
			<section
				aria-label="Judge"
				className="flex min-h-0 flex-col bg-secondary"
			>
				<div className="flex flex-none items-center gap-2.75 border-b border-divider px-4.25 py-2.75">
					<h2 className="text-12 font-medium tracking-caps text-muted-foreground uppercase">
						Judge · step {String(number)}
					</h2>
				</div>
				<NotShownYet
					words="This pane does not show the judge's verdict yet."
					className="flex-1 overflow-y-auto px-4.25 pt-3.75 pb-6"
				/>
			</section>
		</div>
	);
}
