import KeyHint from "#client/system/components/key-hint";

import SettingsCard from "./settings-card";

interface Shortcut {
	readonly key: string;
	readonly does: string;
}

/**
 * Shell and workspace shortcuts. Esc is
 * the dialog library's own close key, which nothing here binds.
 */
const SHORTCUTS: readonly Shortcut[] = [
	{ does: "search everything", key: "⌘ / Ctrl K" },
	{ does: "run history", key: "g r" },
	{ does: "newest run’s Activity", key: "g m" },
	{ does: "new run", key: "n" },
	{ does: "replay a step", key: "r" },
	{ does: "expand cited evidence", key: "e" },
	{ does: "move through rows", key: "j / k" },
	{ does: "follow / unfollow the tail", key: "f" },
	{ does: "close dialog", key: "Esc" },
];

function KeyboardCard(): React.JSX.Element {
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

export { KeyboardCard as default };
