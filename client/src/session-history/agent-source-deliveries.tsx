import { ExcerptButton } from "./agent-context-evidence";
import type { ExcerptRequest, Readings, Tree } from "./agent-tree-model";
import {
	EMPTY_COLLECTION_LENGTH,
	SINGLE_ITEM_COUNT,
	agentName,
	sizeLabel,
} from "./agent-tree-model";

interface ReceivingAgentsProps {
	readonly tree: Tree;
	readonly sourceId: string;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
}

function ReceivingAgents({
	tree,
	sourceId,
	onOpenExcerpt,
}: ReceivingAgentsProps): React.JSX.Element {
	const receivers = receivingAgents(tree, sourceId);

	return (
		<section
			aria-label="Receiving agents"
			className="flex flex-col gap-2 border-b px-3 py-3"
		>
			<h3>
				<span className="text-12 text-muted-foreground">Receiving agents</span>
			</h3>
			<p className="text-12 text-muted-foreground">
				Sizes are recorded text characters, not tokens and not cost. Cost is
				read per agent and skill below.
			</p>
			<ul className="flex flex-col gap-2">
				{receivers.map(({ agentId, inherited, deliveries }) => (
					<ReceivingAgent
						key={agentName(agentId)}
						agentId={agentId}
						inherited={inherited}
						deliveries={deliveries}
						onOpenExcerpt={onOpenExcerpt}
					/>
				))}
				{receivers.length === EMPTY_COLLECTION_LENGTH ? (
					<li className="text-12 text-muted-foreground">
						No agent's transcript records a delivery of this source.
					</li>
				) : null}
			</ul>
		</section>
	);
}

interface ReceivingAgentProps {
	readonly agentId: string | undefined;
	readonly inherited: boolean;
	readonly deliveries: Readonly<Readings["deliveryEvents"]>;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
}

function ReceivingAgent({
	agentId,
	inherited,
	deliveries,
	onOpenExcerpt,
}: ReceivingAgentProps): React.JSX.Element {
	return (
		<li
			key={agentName(agentId)}
			aria-label={agentName(agentId)}
			className="flex flex-col gap-1"
		>
			<span className="font-mono text-12">
				{agentName(agentId)}
				{inherited ? " · inherited" : ""} · {deliveries.length}{" "}
				{deliveries.length === SINGLE_ITEM_COUNT ? "delivery" : "deliveries"}
				{deliveries.length > SINGLE_ITEM_COUNT ? " · repeated" : ""}
			</span>
			<ul className="flex flex-col gap-1 pl-4">
				{deliveries.map(({ eventId, ordinal, measurement }) => (
					<li key={eventId} className="flex flex-col gap-0.5">
						<small className="font-mono text-12 text-muted-foreground">
							delivery {ordinal} · event {eventId} · {sizeLabel(measurement)}
						</small>
						<ExcerptButton
							agentId={agentId}
							ordinal={ordinal}
							eventId={eventId}
							onOpen={() => {
								onOpenExcerpt({ agentId, eventId });
							}}
						/>
					</li>
				))}
			</ul>
		</li>
	);
}

interface SourceReceiver {
	readonly agentId: string | undefined;
	readonly inherited: boolean;
	readonly deliveries: Readonly<Readings["deliveryEvents"]>;
}

function receivingAgents(
	tree: Tree,
	sourceId: string,
): readonly SourceReceiver[] {
	return [
		{ agentId: undefined, readings: tree.root },
		...tree.agents.flatMap((agent) =>
			agent.evidence === "available"
				? [{ agentId: agent.agentId, readings: agent }]
				: [],
		),
	]
		.map(({ agentId, readings }) => ({
			agentId,
			deliveries: readings.deliveryEvents.filter(
				(delivery) => delivery.sourceId === sourceId,
			),
			inherited: "context" in readings && readings.context === "inherited",
		}))
		.filter(({ deliveries }) => deliveries.length > EMPTY_COLLECTION_LENGTH);
}

export { ReceivingAgents as default };
