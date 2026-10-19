import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";

import isShortcutKey from "#client/shell/shortcut-key";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";

const EMPTY_COLLECTION_LENGTH = 0;

/** How far j and k move the pane: about two rows at its type size. */
const SCROLL_STEP_PX = 40;

interface TailControls {
	readonly scrollBy: (top: number) => void;
	readonly setFollowing: Dispatch<SetStateAction<boolean>>;
	/** Whether the key is held down, which f ignores so a held key toggles once. */
	readonly repeat: boolean;
}

/**
 * The design's tail keys (SPEC.md 2d). Scrolling up reads earlier lines, so
 * k leaves the tail as well.
 */
const TAIL_KEY_ACTIONS = new Map([
	[
		"f",
		({ setFollowing, repeat }: Readonly<TailControls>) => {
			if (!repeat) {
				setFollowing((following) => !following);
			}
		},
	],
	[
		"j",
		({ scrollBy }: Readonly<TailControls>) => {
			scrollBy(SCROLL_STEP_PX);
		},
	],
	[
		"k",
		({ scrollBy, setFollowing }: Readonly<TailControls>) => {
			setFollowing(false);
			scrollBy(-SCROLL_STEP_PX);
		},
	],
]);

/**
 * Bound on the document for the reason the `g` chords are: they have to work
 * when nothing on the page holds focus.
 */
function useTailKeys(
	scrollBy: (top: number) => void,
	setFollowing: Dispatch<SetStateAction<boolean>>,
): void {
	useEffect(() => {
		const listener: EventListener = (event) => {
			if (!(event instanceof KeyboardEvent) || !isShortcutKey(event)) {
				return;
			}

			TAIL_KEY_ACTIONS.get(event.key)?.({
				repeat: event.repeat,
				scrollBy,
				setFollowing,
			});
		};

		document.addEventListener("keydown", listener);

		return () => {
			document.removeEventListener("keydown", listener);
		};
	}, [scrollBy, setFollowing]);
}

/** The running session's footer: whether the pane follows its tail, and how to change that. */
interface TailFooterProps {
	readonly following: boolean;
	readonly toolCalls: number;
}

function TailFooter({
	following,
	toolCalls,
}: TailFooterProps): React.JSX.Element {
	return (
		<div className="flex flex-none items-center gap-3 border-t border-divider px-4.25 py-2.25 text-12 text-dim">
			{following ? (
				<LiveGlyph />
			) : (
				<span aria-hidden="true">{STATUS_VOCABULARY.paused.glyph}</span>
			)}
			<span>
				{following ? "Following tail" : "Tail paused"} ·{" "}
				<span className="font-mono">j/k</span> to scroll,{" "}
				<span className="font-mono">f</span> to{" "}
				{following ? "unfollow" : "follow"}
			</span>
			<span className="ml-auto font-mono">
				tool calls collapsed ({String(toolCalls)})
			</span>
		</div>
	);
}

export { EMPTY_COLLECTION_LENGTH, TailFooter, useTailKeys };
