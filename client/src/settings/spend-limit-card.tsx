import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { launchSettingsQuery } from "#client/launch/settings-query";
import {
	enteredCeilingUsd,
	putSpendCeiling,
	storedCeilingEntry,
} from "#client/launch/spend-ceiling-entry";
import { AmountInput } from "#client/system/components/amount-input";
import { Button } from "#client/system/ui/button";
import { SettingsCard } from "./settings-card";

function storedEntry(spendCeilingUsd: number | null | undefined): string {
	return spendCeilingUsd === null || spendCeilingUsd === undefined
		? ""
		: storedCeilingEntry(spendCeilingUsd);
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
	const invalidEntry = entered !== "" && usd === undefined;

	return (
		<SettingsCard title="Spend limit">
			<p className="mt-1.5 max-w-prose text-14 leading-reading text-muted-foreground">
				Enforced per run and per group. A run cannot start without one and stops
				mid-step when reached.
			</p>
			{settings.data === undefined ? null : (
				<p className="mt-1 max-w-prose text-14 leading-reading text-muted-foreground">
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
				<AmountInput
					value={entered}
					prefix="USD per run"
					accessibleName="Spend limit per run"
					onChange={setDraft}
				/>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					disabled={usd === undefined || store.isPending}
				>
					Store limit
				</Button>
				<span className="text-12 text-dim">
					Group ceiling: attempts × per-run
				</span>
			</form>
			{invalidEntry ? (
				<p role="alert" className="mt-1.5 text-12 text-attention">
					A spend limit is a positive amount in US dollars, such as 2.50, so
					this one is not stored.
				</p>
			) : null}
			{store.isError ? (
				<p role="alert" className="mt-1.5 text-12 text-attention">
					<span aria-hidden="true">⚠ </span>
					{store.error.message}
				</p>
			) : null}
			{settings.isError ? (
				<p role="alert" className="mt-1.5 text-12 text-attention">
					<span aria-hidden="true">⚠ </span>
					{`Could not read the stored limit: ${settings.error.message}`}
				</p>
			) : null}
		</SettingsCard>
	);
}
