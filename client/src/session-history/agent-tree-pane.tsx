import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { AgentCoverage, SelectedDetail } from "./agent-selection-and-coverage";
import ReceivingAgents from "./agent-source-deliveries";
import type {
	Allocation,
	AvailableAgents,
	ExcerptRequest,
	Selection,
	Tree,
} from "./agent-tree-model";
import { AgentTreeNavigation, detachedAgents } from "./agent-tree-navigation";
import PaneHeading from "./pane-heading";

interface AgentTreePaneProps {
	readonly selectionKey: string;
	readonly agents: AvailableAgents;
	readonly sourceId: string | undefined;
	readonly excerpt: ReactNode;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
	readonly onSelectSource: (sourceId: string) => void;
}

/**
 * The agents a saved attempt ran, each with its own context and cost, and,
 * for a selected source, the agents it reached. Every agent's readings stay
 * in its own lane: agents running at once held separate windows.
 */
function AgentTreePane({
	selectionKey,
	agents,
	sourceId,
	excerpt,
	onOpenExcerpt,
	onSelectSource,
}: AgentTreePaneProps): React.JSX.Element {
	const [selection, setSelection] = useAgentSelection(selectionKey);
	const { tree, cost } = agents;
	const detached = detachedAgents(tree);

	return (
		<section
			aria-label="Agents"
			className="flex flex-col rounded-lg border bg-card"
		>
			<PaneHeading>Agents</PaneHeading>
			<AgentCoverage tree={tree} cost={cost} />
			{sourceId === undefined ? null : (
				<ReceivingAgents
					tree={tree}
					sourceId={sourceId}
					onOpenExcerpt={onOpenExcerpt}
				/>
			)}
			<div className="flex min-w-0 flex-col">
				<AgentTreeNavigation
					tree={tree}
					cost={cost}
					selection={selection}
					setSelection={setSelection}
					detached={detached}
				/>
				<SelectedAgentReading
					tree={tree}
					cost={cost}
					selection={selection}
					onOpenExcerpt={onOpenExcerpt}
					onSelectSource={onSelectSource}
				/>
				<AgentDeliveryExcerpt excerpt={excerpt} />
			</div>
		</section>
	);
}

function useAgentSelection(
	selectionKey: string,
): readonly [Selection, (selection: Selection) => void] {
	const queryClient = useQueryClient();
	const cached = useQuery({
		enabled: false,
		gcTime: Infinity,
		initialData: null,
		queryFn: (): Selection | null => null,
		queryKey: ["agent-tree-selection", selectionKey],
	});
	const [selection, setSelection] = useState<Selection>(
		() => cached.data ?? { agentId: undefined, kind: "agent" },
	);
	useEffect(() => {
		queryClient.setQueryData(["agent-tree-selection", selectionKey], selection);
	}, [queryClient, selectionKey, selection]);
	return [selection, setSelection];
}

interface AgentDeliveryExcerptProps {
	readonly excerpt: ReactNode;
}

function AgentDeliveryExcerpt({
	excerpt,
}: AgentDeliveryExcerptProps): React.JSX.Element {
	return (
		<section aria-label="Delivery excerpt" className="min-w-0 border-t">
			<PaneHeading>Delivery excerpt</PaneHeading>
			{excerpt}
		</section>
	);
}

interface SelectedAgentReadingProps {
	readonly tree: Tree;
	readonly cost: Allocation;
	readonly selection: Selection;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
	readonly onSelectSource: (sourceId: string) => void;
}

function SelectedAgentReading({
	tree,
	cost,
	selection,
	onOpenExcerpt,
	onSelectSource,
}: SelectedAgentReadingProps): React.JSX.Element {
	return (
		<section
			aria-label="Selected in the agent tree"
			className="min-w-0 px-3 py-3"
		>
			<SelectedDetail
				tree={tree}
				allocation={cost}
				selection={selection}
				onOpenExcerpt={onOpenExcerpt}
				onSelectSource={onSelectSource}
			/>
		</section>
	);
}

export { agentName } from "./agent-tree-model";
export type { AgentsResponse, ExcerptRequest } from "./agent-tree-model";
export { AgentTreePane };
