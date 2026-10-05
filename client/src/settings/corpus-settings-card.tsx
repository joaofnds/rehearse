import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { corpusQuery } from "#client/corpus/corpus-query";
import type { SettingsReading } from "#client/launch/settings-query";
import { launchSettingsQuery } from "#client/launch/settings-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { Button } from "#client/system/ui/button";
import { SettingsCard } from "./settings-card";
import {
	linkCorpusDirectory,
	rehashCorpus,
	unlinkCorpusDirectory,
} from "./settings-requests";

/**
 * The label the corpus screen shows for the corpus under test, once the
 * corpus read is of the root linked now rather than the one linked before.
 */
function VersionLabel({
	root,
}: Readonly<{ root: string }>): React.JSX.Element | null {
	const corpus = useQuery(corpusQuery);
	if (corpus.isError) {
		return (
			<span className="text-pale">
				<span aria-hidden="true">⚠ </span>
				corpus unreadable
			</span>
		);
	}

	if (corpus.data?.root !== root) {
		return null;
	}

	return (
		<span className="text-pale">
			{corpus.data.digest === undefined ? (
				<>
					<span aria-hidden="true">⚠ </span>
					digest withheld
				</>
			) : (
				corpusVersionLabel(corpus.data.digest)
			)}
		</span>
	);
}

type Outcome =
	| { readonly kind: "none" }
	| { readonly kind: "rehashed"; readonly label: string }
	| { readonly kind: "refused"; readonly reason: string };

export function CorpusSettingsCard(): React.JSX.Element {
	const settings = useQuery(launchSettingsQuery);
	const queryClient = useQueryClient();
	const [directory, setDirectory] = useState("");
	const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });

	/** The run history reads each run's staleness against the linked corpus. */
	async function showLinkedCorpus(reading: SettingsReading): Promise<void> {
		queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
		setOutcome({ kind: "none" });
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: corpusQuery.queryKey }),
			queryClient.invalidateQueries({ queryKey: runHistoryQuery.queryKey }),
		]);
	}

	function refused(error: Readonly<Error>): void {
		setOutcome({ kind: "refused", reason: error.message });
	}

	const link = useMutation({
		mutationFn: linkCorpusDirectory,
		onSuccess: async (reading) => {
			setDirectory("");
			await showLinkedCorpus(reading);
		},
		onError: refused,
	});
	const unlink = useMutation({
		mutationFn: unlinkCorpusDirectory,
		onSuccess: showLinkedCorpus,
		onError: refused,
	});
	const rehash = useMutation({
		mutationFn: rehashCorpus,
		onSuccess: (label) => {
			setOutcome({ kind: "rehashed", label });
		},
		onError: refused,
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: corpusQuery.queryKey });
		},
	});
	const writing = link.isPending || unlink.isPending || rehash.isPending;

	return (
		<SettingsCard title="Corpus">
			{settings.isError ? (
				<p role="alert" className="mt-2 text-12 text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{`Could not read which corpus is linked: ${settings.error.message}`}
				</p>
			) : null}
			{settings.data === undefined ? null : (
				<div className="mt-2 flex items-center gap-2.5 font-mono text-12">
					<span className="flex-1 break-all">
						{settings.data.linkedCorpus.root}
					</span>
					<VersionLabel root={settings.data.linkedCorpus.root} />
				</div>
			)}
			<div className="mt-2 flex gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={writing}
					onClick={() => {
						rehash.mutate();
					}}
				>
					Rehash now
				</Button>
				{settings.data?.linkedCorpus.kind === "directory" ? (
					<Button
						variant="outline"
						size="sm"
						disabled={writing}
						onClick={() => {
							unlink.mutate();
						}}
					>
						Unlink corpus
					</Button>
				) : null}
			</div>
			<form
				className="mt-3 flex items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					link.mutate(directory);
				}}
			>
				<input
					value={directory}
					aria-label="Corpus directory to link"
					placeholder="~/code/omelette/.claude"
					onChange={(event) => {
						setDirectory(event.target.value);
					}}
					className="h-8 min-w-0 flex-1 rounded-md border border-strong bg-background px-2 font-mono text-12"
				/>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					disabled={directory === "" || writing}
				>
					Link
				</Button>
			</form>
			{outcome.kind === "rehashed" ? (
				<p className="mt-1.5 font-mono text-12 text-pale">
					{`Rehashed as ${outcome.label}`}
				</p>
			) : null}
			{outcome.kind === "refused" ? (
				<p role="alert" className="mt-1.5 text-12 text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{outcome.reason}
				</p>
			) : null}
		</SettingsCard>
	);
}
