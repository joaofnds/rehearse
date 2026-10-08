import type { ReactNode } from "react";
import { cn } from "#client/system/cn";

function SetupStep({
	number,
	title,
	state,
	locked = false,
	children,
}: {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly locked?: boolean;
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<li
			className={cn(
				"rounded-card border border-strong px-5.5 py-5",
				locked ? "border-dashed opacity-50" : "bg-raised",
			)}
		>
			<div className="flex items-center gap-2.5">
				<span
					aria-hidden="true"
					className={cn(
						"grid size-6 flex-none place-items-center rounded-full border font-mono text-11",
						locked
							? "border-stronger text-muted-foreground"
							: "border-deeper text-pale",
					)}
				>
					{number}
				</span>
				<h2 className="text-14">{title}</h2>
				<span className="ml-auto text-10 tracking-label text-dim uppercase">
					{state}
				</span>
			</div>
			{children}
		</li>
	);
}

function StepProse({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<p className="mt-2.5 max-w-intro text-12-5 text-muted-foreground">
			{children}
		</p>
	);
}

/**
 * What a fresh install shows on every screen: a spend limit, then a corpus,
 * then the case they make possible (SPEC.md section 11).
 */
export function SetupPage(): React.JSX.Element {
	return (
		<div className="flex justify-center px-10 py-17">
			<div className="w-full max-w-191">
				<h1 className="text-22 tracking-tight">Nothing is measured yet</h1>
				<p className="mt-2.5 max-w-intro text-muted-foreground">
					Rehearse needs two things before a case can be declared: a hard
					ceiling on what a run may spend, and the instruction corpus whose
					effect it is measuring. A case is meaningless without a corpus to
					attribute results to.
				</p>

				<ol aria-label="Setup steps" className="mt-8.5 flex flex-col gap-3.5">
					<SetupStep number={1} title="Set a spend limit" state="Required">
						<StepProse>
							Applies per run and per group. Rehearse refuses to start a run
							without one, and stops mid-step when the ceiling is reached.
						</StepProse>
					</SetupStep>
					<SetupStep
						number={2}
						title="Point at an instruction corpus"
						state="Required"
					>
						<StepProse>
							A directory of instruction files: the project instruction file,
							skills, rubrics. Rehearse hashes each file on every run so a
							result always names the version that produced it.
						</StepProse>
					</SetupStep>
					<SetupStep
						number={3}
						title="Declare your first case"
						state="Locked"
						locked
					>
						<StepProse>
							Unlocks once a corpus is linked. Two kinds: a multi-step task
							against a target repository, or a single agent session judged by
							deterministic checks.
						</StepProse>
					</SetupStep>
				</ol>
			</div>
		</div>
	);
}
