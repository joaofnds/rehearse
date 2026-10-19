import { useQuery } from "@tanstack/react-query";

import confirmationRepQuery from "./confirmation-rep-query";
import type { SessionHistoryIdentity } from "./session-history-page";
import { SessionHistoryPage } from "./session-history-page";

interface ConfirmationContextProps {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "confirmation" }>;
}

function ConfirmationContext({
	identity,
}: ConfirmationContextProps): React.JSX.Element {
	const result = useQuery(
		confirmationRepQuery(identity.groupId, identity.repId),
	);
	if (result.isLoading) {
		return (
			<p className="page-gutter py-4 text-12 text-dim">Reading rep mode…</p>
		);
	}
	if (result.isError || result.data === undefined) {
		return (
			<p role="alert" className="page-gutter py-4 text-12 text-dim">
				Saved rep context unavailable because its result could not be read.
			</p>
		);
	}
	return result.data.mode === "session" ? (
		<SessionHistoryPage identity={identity} embedded />
	) : (
		<p className="page-gutter py-4 text-12 text-dim">
			A {result.data.mode} rep has no saved session context view. Its stage and
			final outcomes are on Results.
		</p>
	);
}

interface AttemptContextProps {
	readonly identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>;
}

function AttemptContext({ identity }: AttemptContextProps): React.JSX.Element {
	return identity.kind === "confirmation" ? (
		<ConfirmationContext identity={identity} />
	) : (
		<SessionHistoryPage identity={identity} embedded />
	);
}

export { AttemptContext as default };
