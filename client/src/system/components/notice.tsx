import type { ReactNode } from "react";

import Disclosure from "./disclosure";

const EMPTY_COLLECTION_LENGTH = 0;

interface NoticeProps {
	readonly message: string;
	readonly items: readonly string[];
	readonly children?: ReactNode;
	readonly collapsible?: boolean;
}

function Notice({
	message,
	items,
	children,
	collapsible = false,
}: NoticeProps): React.JSX.Element {
	const details = (
		<ul className="flex w-full min-w-0 flex-col gap-2 font-mono text-13 leading-transcript text-muted-foreground">
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	);

	return (
		<div
			role="alert"
			className="min-w-0 rounded-lg border border-attention/20 border-l-3 border-l-attention/60 bg-card px-4 py-3 text-14 wrap-anywhere text-secondary-foreground"
		>
			<p className="font-medium text-foreground">
				<span aria-hidden="true" className="text-attention">
					⚠{" "}
				</span>
				{message}
			</p>
			{items.length > EMPTY_COLLECTION_LENGTH ? (
				<div className="mt-1.5 min-w-0">
					{collapsible ? (
						<Disclosure
							collapsedLabel={`Show details (${items.length})`}
							expandedLabel="Hide details"
						>
							<div className="w-full min-w-0 border-t border-divider pt-3">
								{details}
							</div>
						</Disclosure>
					) : (
						details
					)}
				</div>
			) : null}
			{children}
		</div>
	);
}

export { Notice as default };
