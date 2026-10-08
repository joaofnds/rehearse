import type { ReactNode } from "react";
import { useState } from "react";
import { enteredCeilingUsd } from "#client/launch/spend-ceiling-entry";
import { cn } from "#client/system/cn";
import { FilterPill } from "#client/system/components/filter-pill";

const LIMIT_PRESETS = ["5.00", "20.00", "50.00"] as const;

/** The prototype's opening amount, one of the presets. */
const OPENING_LIMIT = "20.00";

type StepLook = "open" | "dimmed" | "locked";

function SetupStep({
	number,
	title,
	state,
	look,
	children,
}: {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly look: StepLook;
	readonly children: ReactNode;
}): React.JSX.Element {
	const locked = look === "locked";

	return (
		<li
			className={cn(
				"rounded-card border px-5.5 py-5",
				look === "open" && "border-strong bg-raised",
				look === "dimmed" && "border-divider bg-raised opacity-55",
				locked && "border-dashed border-strong opacity-50",
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
function SpendLimitControls({
	limit,
	onLimit,
}: {
	readonly limit: string;
	readonly onLimit: (limit: string) => void;
}): React.JSX.Element {
	return (
		<div className="mt-3.5 flex flex-wrap items-center gap-2.5">
			<label className="flex items-center gap-2 rounded-md border border-strong bg-background px-2.5 py-2">
				<span className="text-11 text-muted-foreground">USD</span>
				<input
					value={limit}
					inputMode="decimal"
					aria-label="Spend limit in US dollars"
					onChange={(event) => {
						onLimit(event.target.value);
					}}
					className="w-22 bg-transparent font-mono text-13 outline-none"
				/>
			</label>
			{LIMIT_PRESETS.map((preset) => (
				<FilterPill
					key={preset}
					pressed={limit === preset}
					onPress={() => {
						onLimit(preset);
					}}
				>
					{`$${preset}`}
				</FilterPill>
			))}
		</div>
	);
}

export function SetupPage(): React.JSX.Element {
	const [limit, setLimit] = useState<string>(OPENING_LIMIT);
	const limitSet = enteredCeilingUsd(limit) !== undefined;

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
					<SetupStep
						number={1}
						title="Set a spend limit"
						state="Required"
						look="open"
					>
						<StepProse>
							Applies per run and per group. Rehearse refuses to start a run
							without one, and stops mid-step when the ceiling is reached.
						</StepProse>
						<SpendLimitControls limit={limit} onLimit={setLimit} />
					</SetupStep>
					<SetupStep
						number={2}
						title="Point at an instruction corpus"
						state={limitSet ? "Required" : "Set a limit first"}
						look={limitSet ? "open" : "dimmed"}
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
						look="locked"
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
