import { useQuery } from "@tanstack/react-query";

import { apiClient } from "#client/api-client";
import SectionLabel from "#client/system/components/section-label";

import type { GroupReads } from "./group-workspace-contract";
import { EMPTY_COLLECTION_LENGTH } from "./group-workspace-contract";

async function readGroupReads(groupId: string): Promise<GroupReads> {
	const response = await apiClient.api.groups[":groupId"].reads.$get({
		param: { groupId: encodeURIComponent(groupId) },
	});
	if (!response.ok) {
		throw new Error("Could not read the group's frozen instruction reads");
	}
	return await response.json();
}

interface GroupReadsQuery {
	readonly queryKey: readonly ["group-reads", string];
	readonly queryFn: () => Promise<GroupReads>;
}

function groupReadsQuery(groupId: string): GroupReadsQuery {
	return {
		queryFn: async () => await readGroupReads(groupId),
		queryKey: ["group-reads", groupId],
	} as const;
}

interface ReadingPanelProps {
	readonly groupId: string;
}

function ReadingPanel({ groupId }: ReadingPanelProps): React.JSX.Element {
	const query = useQuery(groupReadsQuery(groupId));
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2>
				<SectionLabel>Frozen instruction reads</SectionLabel>
			</h2>
			{query.isLoading ? (
				<p className="mt-2 text-12 text-dim">Loading reads…</p>
			) : null}
			{query.isError ? (
				<p role="alert" className="mt-2 text-12 text-dim">
					{query.error.message}
				</p>
			) : null}
			{query.data?.reasons.map((reason) => (
				<p key={reason} className="mt-2 text-12 text-muted-foreground">
					{reason}
				</p>
			))}
			{query.data?.reps.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="mt-2 text-12 text-muted-foreground">
					No rep read manifest was recorded.
				</p>
			) : null}
			<RepInstructionReads reps={query.data?.reps} />
		</section>
	);
}

interface RepInstructionReadsProps {
	readonly reps: GroupReads["reps"] | undefined;
}

function RepInstructionReads({
	reps,
}: RepInstructionReadsProps): React.JSX.Element {
	return (
		<ul className="mt-2 flex flex-col gap-2">
			{reps?.map((rep) => (
				<li
					key={`${rep.repId}:${rep.stage}`}
					className="border-t border-subtle pt-2"
				>
					<p className="font-mono text-12">
						{rep.repId} · {rep.stage}
					</p>
					{rep.readManifest.length === EMPTY_COLLECTION_LENGTH ? (
						<p className="text-12 text-dim">No files recorded</p>
					) : null}
					<ul className="mt-1 flex flex-col gap-1">
						{rep.readManifest.map((read) => (
							<li
								key={`${read.path}:${read.role}`}
								className="flex flex-wrap gap-x-2 text-12"
							>
								<span className="font-mono">{read.path}</span>
								<span className="text-dim">{read.role}</span>
								{"state" in read ? (
									<span className="text-secondary-foreground">
										{read.state}
									</span>
								) : (
									<span className="text-dim">not judged</span>
								)}
							</li>
						))}
					</ul>
				</li>
			))}
		</ul>
	);
}

export { ReadingPanel as default };
