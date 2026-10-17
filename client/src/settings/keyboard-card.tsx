import { KeyHint } from "#client/system/components/key-hint";
import { SettingsCard } from "./settings-card";

interface Shortcut {
	readonly key: string;
	readonly does: string;
}

/**
 * Shell and workspace shortcuts. Esc is
 * the dialog library's own close key, which nothing here binds.
 */
const SHORTCUTS: readonly Shortcut[] = [
	{ key: "⌘ / Ctrl K", does: "search everything" },
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
			<ul className="mt-4 grid gap-x-6 gap-y-3 text-14 sm:grid-cols-2">
				{SHORTCUTS.map(({ key, does }) => (
					<li key={key} className="flex items-center gap-3">
						<span className="w-28 shrink-0">
							<KeyHint letter={key} decorative={false} />
						</span>
						<span className="text-secondary-foreground">{does}</span>
					</li>
				))}
			</ul>
		</SettingsCard>
	);
}
