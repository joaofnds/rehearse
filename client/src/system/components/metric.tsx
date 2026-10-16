import type { ReactNode } from "react";

export function Metric({
	label,
	value,
	hint,
}: {
	readonly label: string;
	readonly value: ReactNode;
	readonly hint?: ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<dt className="text-12 text-muted-foreground">{label}</dt>
			<dd className="text-14 tabular-nums">{value}</dd>
			{hint === undefined ? null : (
				<dd className="text-12 text-muted-foreground">{hint}</dd>
			)}
		</div>
	);
}
