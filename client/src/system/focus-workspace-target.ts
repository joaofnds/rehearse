export function focusWorkspaceTarget(
	target: Readonly<
		Pick<HTMLElement, "focus" | "closest" | "getBoundingClientRect">
	>,
): void {
	target.focus({ preventScroll: true });

	const workspace = target.closest<HTMLElement>(
		'[data-scroll-restoration-id="workspace"]',
	);

	if (workspace !== null) {
		workspace.scrollTop +=
			target.getBoundingClientRect().top -
			workspace.getBoundingClientRect().top;
	}
}
