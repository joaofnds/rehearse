import type { ReactNode } from "react";

interface EmptyStateProps {
	readonly heading: string;
	readonly children: ReactNode;
}

function EmptyState({ heading, children }: EmptyStateProps): React.JSX.Element {
	return (
		<div className="grid place-items-center py-8 sm:py-16">
			<div className="max-w-sm">
				<h2 className="text-16 font-semibold">{heading}</h2>
				<div className="mt-2 flex flex-col items-start gap-4 text-14 text-muted-foreground">
					{children}
				</div>
			</div>
		</div>
	);
}

export { EmptyState as default };
