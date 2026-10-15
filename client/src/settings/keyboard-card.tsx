import { SettingsCard } from "./settings-card";

interface Shortcut {
	readonly key: string;
	readonly does: string;
}

/**
 * The design's eight shortcuts in its order and wording (SPEC.md:356). Esc is
 * the dialog library's own close key, which nothing here binds.
 */
const SHORTCUTS: readonly Shortcut[] = [
	{ key: "g r", does: "run history" },
	{ key: "g m", does: "newest run’s Activity" },
	{ key: "n", does: "new run" },
	{ key: "r", does: "replay a step" },
	{ key: "e", does: "expand cited evidence" },
	{ key: "j / k", does: "move through rows" },
	{ key: "f", does: "follow / unfollow the tail" },
	{ key: "Esc", does: "close dialog" },
];

export function KeyboardCard(): React.JSX.Element {
	return (
		<SettingsCard title="Keyboard">
			<ul className="mt-2 grid grid-cols-2 gap-x-4.5 gap-y-1.5 text-12">
				{SHORTCUTS.map(({ key, does }) => (
					<li key={key} className="flex items-baseline gap-2.5">
						<span className="rounded-sm border border-strong px-1.5 py-px font-mono text-11 text-pale">
							{key}
						</span>
						<span className="text-secondary-foreground">{does}</span>
					</li>
				))}
			</ul>
		</SettingsCard>
	);
}
