import { useEffect, useRef } from "react";

import isShortcutKey from "./shortcut-key";
import { CHORD_WINDOW_MS } from "./use-go-to-shortcut";

/**
 * Calls `onPress` when `key` is pressed as a single-key shortcut (SPEC.md:356),
 * or never while `key` is undefined. A key pressed within a `g` chord's window
 * belongs to the chord, so `g r` reaches run history without also pressing `r`.
 */
function useKeyShortcut(key: string | undefined, onPress: () => void): void {
	const press = useRef(onPress);
	press.current = onPress;

	useEffect((): (() => void) | undefined => {
		if (key === undefined) {
			return undefined;
		}

		let chordSince: number | undefined = undefined;

		const listener: EventListener = (event) => {
			if (!(event instanceof KeyboardEvent) || !isShortcutKey(event)) {
				return;
			}

			const inChord =
				chordSince !== undefined && Date.now() - chordSince < CHORD_WINDOW_MS;
			chordSince = event.key === "g" ? Date.now() : undefined;

			if (event.key === key && !event.repeat && !inChord) {
				event.preventDefault();
				press.current();
			}
		};

		document.addEventListener("keydown", listener);

		return () => {
			document.removeEventListener("keydown", listener);
		};
	}, [key]);
}

export { useKeyShortcut as default };
