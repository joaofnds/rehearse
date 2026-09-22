import type { ReactNode } from "react";

export function EmptyState({
	heading,
	children,
}: {
	readonly heading: string;
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<div className="grid place-items-center py-16">
			<div className="max-w-sm">
				<h2 className="text-lg font-medium">{heading}</h2>
				<div className="mt-2 flex flex-col items-start gap-4 text-base text-muted-foreground">
					{children}
				</div>
			</div>
		</div>
	);
}
