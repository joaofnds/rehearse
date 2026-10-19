import { useId } from "react";

/** One of the screen's cards, named by its heading. */
interface SettingsCardProps {
	readonly title: string;
	readonly children: React.ReactNode;
}

function SettingsCard({
	title,
	children,
}: SettingsCardProps): React.JSX.Element {
	const heading = useId();

	return (
		<section
			aria-labelledby={heading}
			className="rounded-lg border border-divider bg-card p-6"
		>
			<h2 id={heading} className="text-16 font-semibold">
				{title}
			</h2>
			{children}
		</section>
	);
}

export { SettingsCard as default };
