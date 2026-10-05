import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { launchSettingsQuery } from "#client/launch/settings-query";
import {
	enteredCeilingUsd,
	putSpendCeiling,
} from "#client/launch/spend-ceiling-entry";
import { Button } from "#client/system/ui/button";
import { SettingsCard } from "./settings-card";

/** The stored ceiling as the operator types one, to the cent. */
function storedEntry(spendCeilingUsd: number | null | undefined): string {
	return spendCeilingUsd === null || spendCeilingUsd === undefined
		? ""
		: spendCeilingUsd.toFixed(2);
}

export function SpendLimitCard(): React.JSX.Element {
	const settings = useQuery(launchSettingsQuery);
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<string | undefined>(undefined);
	const store = useMutation({
		mutationFn: putSpendCeiling,
		onSuccess: (reading) => {
			queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
			setDraft(undefined);
		},
	});
	const entered = draft ?? storedEntry(settings.data?.spendCeilingUsd);
	const usd = enteredCeilingUsd(entered);
	const refused = entered !== "" && usd === undefined;

	return (
		<SettingsCard title="Spend limit">
			<p className="mt-1.5 max-w-prose text-12-5 text-muted-foreground">
				Enforced per run and per group. A run cannot start without one and stops
				mid-step when reached.
			</p>
			{settings.data === undefined ? null : (
				<p className="mt-1 max-w-prose text-12-5 text-muted-foreground">
					{settings.data.overrun}
				</p>
			)}
			<form
				className="mt-3 flex flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (usd !== undefined) {
						store.mutate(usd);
					}
				}}
			>
				<label className="flex items-center gap-1.5 rounded-md border border-strong bg-background px-2 py-1.5">
					<span className="text-11 text-muted-foreground">USD per run</span>
					<input
						value={entered}
						inputMode="decimal"
						aria-label="Spend limit per run"
						onChange={(event) => {
							setDraft(event.target.value);
						}}
						className="w-22 bg-transparent font-mono text-13"
					/>
				</label>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					disabled={usd === undefined || store.isPending}
				>
					Store limit
				</Button>
				<span className="text-11-5 text-dim">
					Group ceiling: attempts × per-run
				</span>
			</form>
			{refused ? (
				<p role="alert" className="mt-1.5 text-12 text-secondary-foreground">
					A spend limit is a positive amount in US dollars, such as 2.50, so
					this one is not stored.
				</p>
			) : null}
			{store.isError ? (
				<p role="alert" className="mt-1.5 text-12 text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{store.error.message}
				</p>
			) : null}
			{settings.isError ? (
				<p role="alert" className="mt-1.5 text-12 text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{`Could not read the stored limit: ${settings.error.message}`}
				</p>
			) : null}
		</SettingsCard>
	);
}
