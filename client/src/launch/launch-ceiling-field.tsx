import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import AmountInput from "#client/system/components/amount-input";
import { Button } from "#client/system/ui/button";

import { holdsUnstoredCeiling, shownCeiling } from "./launch-budget";
import type { SettingsReading } from "./settings-query";
import { launchSettingsQuery } from "./settings-query";
import { enteredCeilingUsd, putSpendCeiling } from "./spend-ceiling-entry";

/**
 * The stored spend ceiling, edited in place: storing it changes the ceiling
 * every later launch and CLI run holds to, not just this launch.
 */
interface SpendCeilingFieldProps {
	readonly storedUsd: number | undefined;
	readonly draft: string | undefined;
	readonly onDraft: (draft?: string) => void;
}

function SpendCeilingField({
	storedUsd,
	draft,
	onDraft,
}: SpendCeilingFieldProps): React.JSX.Element {
	const store = useStoreSpendDefault(onDraft);
	const entered = shownCeiling(draft, storedUsd);
	const usd = enteredCeilingUsd(entered);

	return (
		<section
			aria-label="Saved spending default"
			className="rounded-md border border-divider p-3"
		>
			<h3 className="text-14 font-medium">Saved spending default</h3>
			<p className="mt-1 text-12 text-secondary-foreground">
				Start uses the saved default; this dialog has no per-launch override.
			</p>
			<label
				htmlFor="launch-spend-ceiling"
				className="mt-3 block text-12 text-muted-foreground"
			>
				Default ceiling per attempt
			</label>
			<SpendDefaultForm
				storedUsd={storedUsd}
				draft={draft}
				entered={entered}
				usd={usd}
				onDraft={onDraft}
				pending={store.isPending}
				onSave={store.mutate}
			/>
			<p className="mt-1 text-12 text-secondary-foreground">
				Saving changes the default for this launch and future browser launches
				and CLI runs.
			</p>
			<SpendDefaultStatus
				draft={draft}
				storedUsd={storedUsd}
				failure={store.isError ? store.error.message : undefined}
			/>
		</section>
	);
}

interface SpendDefaultFormProps {
	readonly storedUsd: number | undefined;
	readonly draft: string | undefined;
	readonly entered: string;
	readonly usd: number | undefined;
	readonly onDraft: SpendCeilingFieldProps["onDraft"];
	readonly pending: boolean;
	readonly onSave: (usd: number) => void;
}

function SpendDefaultForm({
	storedUsd,
	draft,
	entered,
	usd,
	onDraft,
	pending,
	onSave,
}: SpendDefaultFormProps): React.JSX.Element {
	return (
		<form
			className="mt-1 flex flex-wrap items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				if (usd !== undefined) {
					onSave(usd);
				}
			}}
		>
			<AmountInput
				id="launch-spend-ceiling"
				value={entered}
				accessibleName="Default ceiling per attempt"
				onChange={onDraft}
			/>
			<Button
				type="submit"
				variant="outline"
				size="sm"
				disabled={usd === undefined || pending}
			>
				Save default
			</Button>
			{storedUsd !== undefined && holdsUnstoredCeiling(draft, storedUsd) ? (
				<Button
					type="button"
					size="sm"
					variant="quiet"
					disabled={pending}
					onClick={() => {
						onDraft();
					}}
				>
					Use saved default
				</Button>
			) : null}
		</form>
	);
}

function useStoreSpendDefault(
	onDraft: SpendCeilingFieldProps["onDraft"],
): UseMutationResult<SettingsReading, Error, number> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: putSpendCeiling,
		onSuccess: (reading) => {
			queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
			onDraft();
		},
	});
}

interface SpendDefaultStatusProps {
	readonly draft: string | undefined;
	readonly storedUsd: number | undefined;
	readonly failure: string | undefined;
}

function SpendDefaultStatus({
	draft,
	storedUsd,
	failure,
}: SpendDefaultStatusProps): React.JSX.Element {
	return (
		<>
			{holdsUnstoredCeiling(draft, storedUsd) ? (
				<p className="mt-1 text-12 text-muted-foreground">
					Unsaved default change. Save the default or restore the saved value
					before starting.
				</p>
			) : null}
			{failure === undefined ? null : (
				<p role="alert" className="mt-1 text-14 text-attention">
					<span aria-hidden="true">⚠ </span>
					{failure}
				</p>
			)}
		</>
	);
}

export { SpendCeilingField as default };
