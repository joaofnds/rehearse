import { useId } from "react";

/** One of the screen's cards, named by its heading. */
export function SettingsCard({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}): React.JSX.Element {
	const heading = useId();

	return (
		<section
			aria-labelledby={heading}
			className="rounded-lg border border-strong bg-raised px-4 py-3.5"
		>
			<h2 id={heading} className="text-14 font-medium">
				{title}
			</h2>
			{children}
		</section>
	);
}
