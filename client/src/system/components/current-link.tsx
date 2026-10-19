import { createLink } from "@tanstack/react-router";
import type { ComponentPropsWithRef } from "react";

type CurrentAnchorProps = ComponentPropsWithRef<"a"> & {
	readonly marksCurrent: boolean;
};

function CurrentAnchor({
	marksCurrent,
	"aria-current": _current,
	...anchor
}: CurrentAnchorProps): React.JSX.Element {
	return <a {...anchor} aria-current={marksCurrent ? "page" : undefined} />;
}

const CurrentLink = createLink(CurrentAnchor);

export { CurrentLink as default };
