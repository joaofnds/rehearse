import type { SessionHistoryReport } from "#benchmark/session-history";
import attemptLabel from "#client/attempt-label";
import { LaunchDialog } from "#client/launch/launch-dialog";
import ScreenHeader from "#client/system/components/screen-header";

import type { SessionHistoryIdentity } from "./history-investigation-contract";
import type { RecordNames } from "./history-record-names";

interface IdentityEntry {
	readonly term: string;
	readonly value: string;
	/**
	 * The Record ID part a short id or position stands in for, shown beneath
	 * it, since the short id is an alias and the Record ID stays canonical.
	 */
	readonly filedUnder?: string;
}

/** The entry for a term shows its short id or position, with what it is filed under beneath. */
function named(
	entries: readonly IdentityEntry[],
	term: string,
	value: string | undefined,
): readonly IdentityEntry[] {
	return value === undefined
		? entries
		: entries.map((entry) =>
				entry.term === term ? { filedUnder: entry.value, term, value } : entry,
			);
}

function inserted(
	entries: readonly IdentityEntry[],
	afterTerm: string,
	added: readonly (IdentityEntry | undefined)[],
): readonly IdentityEntry[] {
	const present = added.filter((entry) => entry !== undefined);

	return entries.flatMap((entry) =>
		entry.term === afterTerm ? [entry, ...present] : [entry],
	);
}

function entryOf(
	term: string,
	value: string | undefined,
): IdentityEntry | undefined {
	return value === undefined ? undefined : { term, value };
}

function namedEntries(
	identity: SessionHistoryIdentity,
	attempt: SessionHistoryReport["attempt"],
	names: RecordNames,
): readonly IdentityEntry[] {
	const entries = identityEntries(attempt);
	const attemptOf =
		names.attempt === undefined ? undefined : attemptLabel(names.attempt);
	switch (identity.kind) {
		case "stage": {
			return inserted(named(entries, "Run", names.shortId), "Stage", [
				entryOf("Checkpoint", names.checkpointShortId),
			]);
		}
		case "replay": {
			const replay =
				names.shortId === undefined
					? undefined
					: {
							filedUnder: identity.timestamp,
							term: "Replay",
							value: names.shortId,
						};

			return inserted(
				inserted(named(entries, "Run", names.runShortId), "Case", [replay]),
				"Stage",
				[
					entryOf("Started from", names.checkpointShortId),
					entryOf("Attempt", attemptOf),
				],
			);
		}
		case "standalone": {
			return named(entries, "Attempt", names.shortId);
		}
		case "confirmation": {
			const position =
				attemptOf === undefined || names.shortId === undefined
					? attemptOf
					: `${attemptOf} of ${names.shortId}`;

			return named(entries, "Attempt", position);
		}
		default: {
			return identity satisfies never;
		}
	}
}

/**
 * A stage checkpoint records no attempt id and no outcome, so the run, the
 * stage and the lineage place it instead. A stage that stopped wrote no
 * checkpoint, so it has no lineage to show and shows why it stopped instead.
 * A stage whose judging never completed wrote neither, so it shows neither:
 * the reason it has no transcript is the evidence's, not the identity's.
 */
function identityEntries(
	attempt: SessionHistoryReport["attempt"],
): readonly IdentityEntry[] {
	if (attempt.kind === "stage") {
		return [
			{ term: "Case", value: attempt.caseId },
			{ term: "Run", value: attempt.run },
			{ term: "Stage", value: attempt.stage },
			{ term: "Lineage", value: attempt.lineage },
			{ term: "Model", value: attempt.model },
		];
	}

	if (attempt.kind === "awaiting-judge-stage") {
		return [
			{ term: "Case", value: attempt.caseId },
			{ term: "Run", value: attempt.run },
			{ term: "Stage", value: attempt.stage },
			{ term: "Model", value: attempt.model },
		];
	}

	if (attempt.kind === "stopped-stage") {
		return [
			{ term: "Case", value: attempt.caseId },
			{ term: "Run", value: attempt.run },
			{ term: "Stage", value: attempt.stage },
			{ term: "Model", value: attempt.model },
			{ term: "Stopped because", value: attempt.error },
		];
	}

	if (attempt.kind === "session") {
		return [
			{ term: "Case", value: attempt.caseId },
			{ term: "Attempt", value: attempt.id },
			{ term: "Model", value: attempt.model },
			{ term: "Outcome", value: attempt.outcome },
		];
	}

	return attempt satisfies never;
}

interface PageLeadProps {
	readonly identity: SessionHistoryIdentity;
}

/** A stage page also offers its stage for replay (SPEC.md:355). */
function PageLead({ identity }: PageLeadProps): React.JSX.Element {
	return (
		<span className="flex flex-wrap items-center gap-4">
			<a href="/" className="text-14 text-link hover:text-link-hover">
				← Back to Runs
			</a>
			{identity.kind === "stage" ? (
				<LaunchDialog
					target={{ kind: "replay", run: identity.run, stage: identity.stage }}
					triggerLabel="Replay from here"
				/>
			) : null}
		</span>
	);
}

interface IdentityReadingsProps {
	readonly identity: SessionHistoryIdentity;
	readonly data: SessionHistoryReport;
	readonly names: RecordNames;
}

function IdentityReadings({
	identity,
	data,
	names,
}: IdentityReadingsProps): React.JSX.Element {
	return (
		<dl className="flex flex-wrap gap-x-5 gap-y-2">
			{namedEntries(identity, data.attempt, names).map(
				({ term, value, filedUnder }) => (
					<div key={term} className="flex min-w-0 flex-col gap-1">
						<dt>
							<span className="text-12 text-muted-foreground">{term}</span>
						</dt>
						<dd className="flex flex-col gap-0.5">
							<span className="font-mono text-12 wrap-anywhere">{value}</span>
							{filedUnder === undefined ? null : (
								<span className="font-mono text-12 text-muted-foreground wrap-anywhere">
									{filedUnder}
								</span>
							)}
						</dd>
					</div>
				),
			)}
		</dl>
	);
}

interface HistoryHeaderProps {
	readonly embedded: boolean;
	readonly identity: SessionHistoryIdentity;
	readonly data: SessionHistoryReport | undefined;
	readonly names: RecordNames;
}

function HistoryHeader({
	embedded,
	identity,
	data,
	names,
}: HistoryHeaderProps): React.JSX.Element {
	const metadata =
		data === undefined ? undefined : (
			<details className="text-secondary-foreground">
				<summary className="cursor-pointer text-14">
					Record provenance ·{" "}
					{namedEntries(identity, data.attempt, names).length} fields
				</summary>
				<div className="mt-3">
					<IdentityReadings identity={identity} data={data} names={names} />
				</div>
			</details>
		);
	if (embedded) {
		return (
			<header className="flex flex-col gap-3 page-gutter pt-4">
				<h2 className="text-16">Context &amp; cost · saved evidence</h2>
				{metadata}
			</header>
		);
	}
	return (
		<ScreenHeader
			title="Saved context history"
			eyebrow="Attempt evidence"
			lead={<PageLead identity={identity} />}
			aside={metadata}
		/>
	);
}

export { HistoryHeader as default };
