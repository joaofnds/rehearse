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
		<div className="grid min-h-57.5 grid-cols-monitor-panes overflow-x-auto">
			<section
				aria-label="Live agent session"
				className="flex min-h-0 flex-col border-r border-divider"
			>
				<div className="flex flex-none items-center gap-2.5 border-b border-divider px-3.5 py-2.25">
					<h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
						Step {String(number)} · {stage}
					</h2>
				</div>
			</section>
			<section
				aria-label="Judge"
				className="flex min-h-0 flex-col bg-secondary"
			>
				<div className="flex flex-none items-center gap-2.5 border-b border-divider px-3.5 py-2.25">
					<h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
						Judge · step {String(number)}
					</h2>
				</div>
			</section>
		</div>
	);
}
