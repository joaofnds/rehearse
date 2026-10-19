import type { ReactNode } from "react";

import cn from "#client/system/cn";

type StepLook = "open" | "dimmed" | "locked";

interface SetupStepProps {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly look: StepLook;
	readonly children: ReactNode;
}

function SetupStep({
	number,
	title,
	state,
	look,
	children,
}: SetupStepProps): React.JSX.Element {
	const locked = look === "locked";

	return (
		<li
			className={cn(
				"min-w-0 rounded-card border p-5 sm:p-6",
				look === "open" && "border-strong bg-raised",
				look === "dimmed" && "border-divider bg-raised",
				locked && "border-dashed border-strong",
			)}
		>
			<div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-6 sm:items-center">
				<div className="flex min-w-0 items-center gap-2.5 sm:col-span-4">
					<span
						aria-hidden="true"
						className={cn(
							"grid size-6 flex-none place-items-center rounded-full border font-mono text-12",
							locked
								? "border-stronger text-muted-foreground"
								: "border-deeper text-pale",
						)}
					>
						{number}
					</span>
					<h2 className="min-w-0 text-16 font-semibold wrap-anywhere">
						{title}
					</h2>
				</div>
				<span className="text-12 tracking-label text-dim uppercase sm:col-span-2 sm:text-right">
					{state}
				</span>
			</div>
			{children}
		</li>
	);
}

interface StepProseProps {
	readonly children: ReactNode;
}

function StepProse({ children }: StepProseProps): React.JSX.Element {
	return (
		<p className="mt-2.5 max-w-intro text-14 leading-reading text-muted-foreground">
			{children}
		</p>
	);
}

export { SetupStep, StepProse };
