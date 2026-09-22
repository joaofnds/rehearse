import { Link, useLocation } from "@tanstack/react-router";
import { EmptyState } from "#client/system/components/empty-state";
import { Button } from "#client/system/ui/button";
import "./not-found-page.css";

/**
 * What an address the app does not serve renders, in place of the router's
 * default two bare words on an empty canvas. The address is text the operator
 * did not write, so it is a text child: React escapes those.
 */
export function NotFoundPage(): React.JSX.Element {
	const { pathname } = useLocation();

	return (
		<div className="rh-not-found">
			<EmptyState heading="No screen at this address">
				<p>
					Rehearse serves no screen at <code>{pathname}</code>.
				</p>
				<p>
					<Button asChild>
						<Link to="/">Back to run history</Link>
					</Button>
				</p>
			</EmptyState>
		</div>
	);
}
