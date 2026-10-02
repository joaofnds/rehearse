import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Notice } from "#client/system/components/notice";
import { ScreenHeader } from "#client/system/components/screen-header";
import { CaseCard } from "./case-card";
import { casesQuery } from "./cases-query";
import { DeclareCaseDialog } from "./declare-case-dialog";

export function CasesPage(): React.JSX.Element {
	const query = useQuery(casesQuery);
	const [declaredPath, setDeclaredPath] = useState<string>();
	const cases = query.data?.cases ?? [];
	const unreadable = query.data?.unreadable ?? [];
	const unreadableRecords = query.data?.unreadableRecords ?? [];

	return (
		<div>
			<ScreenHeader
				title="Cases"
				subline="Declared as data on disk · cases/*/case.json"
				aside={<DeclareCaseDialog onDeclared={setDeclaredPath} />}
			/>

			<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
				<p className="max-w-prose text-sm text-muted-foreground">
					Each case's figures are taken over its runs at one corpus version, the
					first recorded reading pipeline runs newest first, then session
					attempts, then finished groups. Groups record no time, so it need not
					be the newest. A run is a pipeline run, a session attempt, or one
					attempt of a group run on the whole case. Stage replays and stage-mode
					groups are not counted.
				</p>

				{declaredPath === undefined ? null : (
					<p role="status" className="text-sm text-secondary-foreground">
						{`Declared ${declaredPath}. The file is uncommitted: commit it to keep the case.`}
					</p>
				)}

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
						message="These run records could not be read, so their verdicts and costs are missing from the figures:"
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
