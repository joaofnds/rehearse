import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Notice } from "#client/system/components/notice";
import { ScreenHeader } from "#client/system/components/screen-header";
import { Button } from "#client/system/ui/button";
import { CaseCard } from "./case-card";
import { casesQuery } from "./cases-query";
import { NOT_WIRED_REASON } from "#client/not-wired";

function DeclareCase(): React.JSX.Element {
	const reasonId = useId();

	return (
		<span className="flex flex-col items-end gap-1.5">
			<Button variant="quiet" aria-disabled="true" aria-describedby={reasonId}>
				Declare a case
			</Button>
			<span id={reasonId} className="text-11-5 text-dim">
				{NOT_WIRED_REASON}
			</span>
		</span>
	);
}

export function CasesPage(): React.JSX.Element {
	const query = useQuery(casesQuery);
	const cases = query.data?.cases ?? [];
	const unreadable = query.data?.unreadable ?? [];
	const unreadableRecords = query.data?.unreadableRecords ?? [];

	return (
		<div>
			<ScreenHeader
				title="Cases"
				subline="Declared as data on disk · cases/*/case.json"
				aside={<DeclareCase />}
			/>

			<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
				<p className="max-w-prose text-sm text-muted-foreground">
					Each case's figures are taken over its runs at the latest corpus
					version any of them ran under. A run is a pipeline run, a session
					attempt, or one attempt of a group. Stage replays are not counted.
				</p>

				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load the cases.
					</p>
				) : null}

				{unreadable.length > 0 ? (
					<Notice
						message="These declarations could not be read, so no card shows them:"
						items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
					/>
				) : null}
				{unreadableRecords.length > 0 ? (
					<Notice
						message="These records could not be read, so no figure counts them:"
						items={unreadableRecords.map(
							({ id, reason }) => `${id}: ${reason}`,
						)}
					/>
				) : null}

				{cases.map((listed) => (
					<CaseCard key={listed.id} listed={listed} />
				))}
			</div>
		</div>
	);
}
