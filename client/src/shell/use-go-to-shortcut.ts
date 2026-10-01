import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { isShortcutKey } from "./shortcut-key";

/**
 * How long the `g` prefix waits for its second key before the chord lapses, so
 * a `g` typed and abandoned does not turn an unrelated later keystroke into a
 * navigation.
 */
const CHORD_WINDOW_MS = 1500;

/**
 * Where each `g` chord goes, keyed by the chord's second key. A test checks
 * each destination against the route tree, because a chord bound to a screen
 * that does not exist would navigate to the not-found page.
 */
export const CHORD_DESTINATIONS = new Map([
	["r", "/"],
	["m", "/monitor"],
]);

/**
 * The design's `g` chords (SPEC.md:356), which belong to the chrome because
 * they reach screens from anywhere. The listener is on the document rather
 * than on an element, because the chord has to work when nothing inside the
 * shell holds focus, which is the state the operator is in after a page load.
 */
export function useGoToShortcut(): void {
	const navigate = useNavigate();
	const pendingSince = useRef<number | undefined>(undefined);

	useEffect(() => {
		function goTo(key: string, shortcut: boolean): void {
			if (!shortcut) {
				pendingSince.current = undefined;

				return;
			}

			const started = pendingSince.current;
			const fresh =
				started !== undefined && Date.now() - started < CHORD_WINDOW_MS;
			pendingSince.current = key === "g" ? Date.now() : undefined;

			const destination = fresh ? CHORD_DESTINATIONS.get(key) : undefined;
			if (destination !== undefined) {
				void navigate({ to: destination });
			}
		}

		const listener: EventListener = (event) => {
			if (event instanceof KeyboardEvent) {
				goTo(event.key, isShortcutKey(event));
			}
		};

		document.addEventListener("keydown", listener);

		return () => {
			document.removeEventListener("keydown", listener);
		};
	}, [navigate]);
}
