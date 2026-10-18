import type { ReactNode } from "react";
import { cn } from "#client/system/cn";

export function RadioChoice({
	name,
	value,
	checked,
	onChoose,
	children,
}: {
	readonly name: string;
	readonly value: string;
	readonly checked: boolean;
	readonly onChoose: () => void;
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<label
			className={cn(
				"inline-flex min-h-touch-target min-w-touch-target cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-14 focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-3",
				checked
					? "border-primary bg-selected font-semibold text-pale"
					: "border-strong bg-card text-secondary-foreground hover:bg-row-hover",
			)}
		>
			<input
				type="radio"
				name={name}
				value={value}
				checked={checked}
				onChange={onChoose}
				className="size-4 min-h-0 shrink-0 accent-primary outline-none"
			/>
			{children}
		</label>
	);
}
