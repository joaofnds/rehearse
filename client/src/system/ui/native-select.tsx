import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "#client/system/cn";

type NativeSelectProps = Omit<ComponentProps<"select">, "className"> & {
	prefix?: string;
};

export function NativeSelect({
	prefix,
	children,
	...props
}: NativeSelectProps): React.JSX.Element {
	return (
		<span className="relative inline-grid min-w-0 w-full max-w-full">
			{prefix === undefined ? null : (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-12 text-muted-foreground"
				>
					{prefix}
				</span>
			)}
			<select
				className={cn(
					"min-h-touch-target min-w-0 w-full appearance-none rounded-lg border border-strong bg-background py-2 pr-11 text-14 text-foreground disabled:cursor-not-allowed disabled:opacity-45",
					prefix === undefined ? "pl-4" : "pl-18",
				)}
				{...props}
			>
				{children}
			</select>
			<ChevronDown
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-secondary-foreground"
			/>
		</span>
	);
}
