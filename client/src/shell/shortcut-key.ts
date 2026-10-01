/** Whether a keystroke went into a field, where it is text rather than a shortcut. */
function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return (
		target.isContentEditable ||
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	);
}

/**
 * Whether a keystroke can be a single-key shortcut: pressed with no modifier,
 * which leaves the browser's and the system's own shortcuts alone, and not
 * typed into a field.
 */
export function isShortcutKey(
	event: Readonly<
		Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "target">
	>,
): boolean {
	return (
		!event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target)
	);
}
