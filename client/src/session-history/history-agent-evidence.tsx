import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { AgentsResponse, ExcerptRequest } from "./agent-tree-pane";
import { AgentTreePane, agentName } from "./agent-tree-pane";
import { agentsQuery, fetchExcerpt } from "./history-agent-queries";
import EvidenceDetail from "./history-evidence-detail";
import type { SessionHistoryIdentity } from "./history-investigation-contract";

interface AgentExcerptProps {
	readonly identity: SessionHistoryIdentity;
	readonly path: string;
	readonly request: ExcerptRequest | undefined;
}

function AgentExcerpt({
	identity,
	path,
	request,
}: AgentExcerptProps): React.JSX.Element | null {
	const excerpt = useQuery({
		enabled: request !== undefined,
		queryFn: async () =>
			await (request === undefined
				? Promise.reject(new Error("No excerpt was asked for"))
				: fetchExcerpt(identity, request)),
		queryKey: [
			"session-history-excerpt",
			path,
			request?.agentId,
			request?.eventId,
		],
	});
	if (request === undefined) {
		return (
			<p className="px-3 py-2.5 text-12 text-muted-foreground">
				Open a delivery's excerpt to read the text the agent received.
			</p>
		);
	}

	return (
		<>
			<p className="px-3 pt-2.5 text-12 text-muted-foreground">
				Received by {agentName(request.agentId)} · event {request.eventId}
			</p>
			<EvidenceDetail
				served
				loading={excerpt.isLoading}
				failed={excerpt.isError}
				detail={excerpt.data}
			/>
		</>
	);
}

interface AgentsSectionProps {
	readonly identity: SessionHistoryIdentity;
	readonly path: string;
	readonly recorded: boolean;
	readonly sourceId: string | undefined;
	readonly onSelectSource: (sourceId: string) => void;
}

/** Only a saved session attempt keeps its agents; a stage or replay shows none. */
function AgentsSection({
	identity,
	path,
	recorded,
	sourceId,
	onSelectSource,
}: AgentsSectionProps): React.JSX.Element | null {
	const agents = useQuery(agentsQuery(identity, path, recorded));
	const [excerptRequest, setExcerptRequest] = useState<ExcerptRequest>();
	if (!recorded) {
		return (
			<p className="px-3 py-3 text-14 text-muted-foreground">
				Saved stages and replays keep no agent transcripts or per-agent request
				measurements.
			</p>
		);
	}
	if (agents.data === undefined) {
		return (
			<p
				className="text-12 text-muted-foreground"
				role={agents.isError ? "alert" : undefined}
			>
				{agents.isError
					? "Could not load the attempt's agents."
					: "Loading agents…"}
			</p>
		);
	}
	if (agents.data.state === "unavailable") {
		return (
			<p className="text-12 text-muted-foreground">
				? Agents unavailable · {agents.data.reason}
			</p>
		);
	}

	return (
		<LoadedAgents
			agents={agents.data}
			sourceId={sourceId}
			identity={identity}
			path={path}
			excerptRequest={excerptRequest}
			setExcerptRequest={setExcerptRequest}
			onSelectSource={onSelectSource}
		/>
	);
}

interface LoadedAgentsProps {
	readonly agents: Extract<AgentsResponse, { state: "available" }>;
	readonly sourceId: string | undefined;
	readonly identity: SessionHistoryIdentity;
	readonly path: string;
	readonly excerptRequest: ExcerptRequest | undefined;
	readonly setExcerptRequest: (request: ExcerptRequest) => void;
	readonly onSelectSource: (sourceId: string) => void;
}

function LoadedAgents({
	agents,
	sourceId,
	identity,
	path,
	excerptRequest,
	setExcerptRequest,
	onSelectSource,
}: LoadedAgentsProps): React.JSX.Element {
	return (
		<AgentTreePane
			selectionKey={path}
			agents={agents}
			sourceId={sourceId}
			excerpt={
				<AgentExcerpt
					identity={identity}
					path={path}
					request={excerptRequest}
				/>
			}
			onOpenExcerpt={setExcerptRequest}
			onSelectSource={onSelectSource}
		/>
	);
}

export { AgentsSection as default };
