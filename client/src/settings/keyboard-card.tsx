import { CHORD_DESTINATIONS } from "#client/shell/use-go-to-shortcut";
import { SettingsCard } from "./settings-card";

interface Shortcut {
	readonly key: string;
	readonly does: string;
	readonly bound: boolean;
}

/**
 * The design's eight shortcuts, in its order and wording
 * (prototype.html:1694-1699). A `g` chord is live while the shell binds it;
 * j / k and f are the monitor's tail keys, and Esc closes every dialog. The
 * design's rule is that a planned control never shows as live (SPEC.md:293),
 * so n, r and e stay planned until something binds them.
 */
const SHORTCUTS: readonly Shortcut[] = [
	{ key: "g r", does: "run history", bound: CHORD_DESTINATIONS.has("r") },
	{ key: "g m", does: "live monitor", bound: CHORD_DESTINATIONS.has("m") },
	{ key: "n", does: "new run", bound: false },
	{ key: "r", does: "replay a step", bound: false },
	{ key: "e", does: "expand cited evidence", bound: false },
	{ key: "j / k", does: "move through rows", bound: true },
	{ key: "f", does: "follow / unfollow the tail", bound: true },
	{ key: "Esc", does: "close dialog", bound: true },
];

export function KeyboardCard(): React.JSX.Element {
	return (
		<SettingsCard title="Keyboard">
			<ul className="mt-2 grid grid-cols-2 gap-x-4.5 gap-y-1.5 text-12">
				{SHORTCUTS.map(({ key, does, bound }) => (
					<li
						key={key}
						className={`flex items-baseline gap-2.5${bound ? "" : " opacity-60"}`}
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
