import { TAIL_KEYS } from "#client/monitor/session-pane";
import { CHORD_DESTINATIONS } from "#client/shell/use-go-to-shortcut";
import { cn } from "#client/system/cn";
import { SettingsCard } from "./settings-card";

interface Shortcut {
	readonly key: string;
	readonly does: string;
	readonly bound: boolean;
}

/**
 * The design's eight shortcuts in its order and wording. A key is live while
 * the code binding it does, so a planned key never shows as live; Esc is the
 * dialog library's own close key, which nothing here binds.
 */
const SHORTCUTS: readonly Shortcut[] = [
	{ key: "g r", does: "run history", bound: CHORD_DESTINATIONS.has("r") },
	{ key: "g m", does: "live monitor", bound: CHORD_DESTINATIONS.has("m") },
	{ key: "n", does: "new run", bound: false },
	{ key: "r", does: "replay a step", bound: false },
	{ key: "e", does: "expand cited evidence", bound: false },
	{
		key: "j / k",
		does: "move through rows",
		bound: TAIL_KEYS.has("j") && TAIL_KEYS.has("k"),
	},
	{
		key: "f",
		does: "follow / unfollow the tail",
		bound: TAIL_KEYS.has("f"),
	},
	{ key: "Esc", does: "close dialog", bound: true },
];

export function KeyboardCard(): React.JSX.Element {
	return (
		<SettingsCard title="Keyboard">
			<ul className="mt-2 grid grid-cols-2 gap-x-4.5 gap-y-1.5 text-12">
				{SHORTCUTS.map(({ key, does, bound }) => (
					<li
						key={key}
						className={cn(
							"flex items-baseline gap-2.5",
							!bound && "opacity-60",
						)}
					>
						<span className="rounded-sm border border-strong px-1.5 py-px font-mono text-11 text-pale">
							{key}
						</span>
						<span className="text-secondary-foreground">{does}</span>
						{bound ? null : (
							<span className="font-mono text-11 text-dim"> planned</span>
						)}
					</li>
				))}
			</ul>
		</SettingsCard>
	);
}
