import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { LaunchDialog } from "#client/launch/launch-dialog";
import { launchSettingsQuery } from "#client/launch/settings-query";
import EmptyState from "#client/system/components/empty-state";
import KeyHint from "#client/system/components/key-hint";
import { Button } from "#client/system/ui/button";

import type { ReplayOffer } from "./replay-choices";

function SetupAccount(): React.JSX.Element | null {
	const settings = useQuery(launchSettingsQuery);
	if (settings.isError) {
		return (
			<p role="alert">
				<span aria-hidden="true">⚠ </span>
				{`Could not read the stored spend limit: ${settings.error.message}`}
			</p>
		);
	}
	const spendCeilingUsd = settings.data?.spendCeilingUsd;
	if (spendCeilingUsd === undefined || spendCeilingUsd === null) {
		return null;
	}

	return <p>The corpus is linked and a spend limit is set.</p>;
}

interface NothingListedProps {
	readonly listable: boolean;
	readonly unreadable: boolean;
}

function NothingListed({
	listable,
	unreadable,
}: NothingListedProps): React.JSX.Element | null {
	if (listable) {
		return (
			<p className="text-muted-foreground">
				No record matches this filter and search.
			</p>
		);
	}
	if (unreadable) {
		return null;
	}

	return (
		<EmptyState heading="No runs recorded">
			<SetupAccount />
			<p>
				Declare a case, then run it. Every attempt lands here as a durable
				record.
			</p>
			<Button asChild>
				<Link to="/cases">Declare a case</Link>
			</Button>
		</EmptyState>
	);
}

interface ReplayAStepProps {
	readonly offer: ReplayOffer | undefined;
}

function ReplayAStep({ offer }: ReplayAStepProps): React.JSX.Element {
	if (offer?.state !== "available") {
		return (
			<>
				{offer === undefined ? null : (
					<span className="text-12 text-dim">{offer.reason}</span>
				)}
				<Button variant="outline" disabled>
					Replay a step
					<KeyHint letter="r" />
				</Button>
			</>
		);
	}

	return (
		<LaunchDialog
			target={{
				kind: "chosen-replay",
				opensOn: offer.opensOn,
				runs: offer.runs,
			}}
			triggerLabel="Replay a step"
			shortcut="r"
		/>
	);
}

interface LoadStateProps {
	readonly loading: boolean;
	readonly failed: boolean;
}

function LoadState({
	loading,
	failed,
}: LoadStateProps): React.JSX.Element | null {
	if (loading) {
		return <p className="text-muted-foreground">Loading…</p>;
	}
	if (failed) {
		return (
			<p role="alert" className="text-attention">
				<span aria-hidden="true">⚠ </span>
				Could not load run history.
			</p>
		);
	}

	return null;
}

export { LoadState, NothingListed, ReplayAStep };
