import type { SessionHistoryEvent } from "#benchmark/session-history";
import cn from "#client/system/cn";

import selectableRow from "./selectable-row";

const EMPTY_COLLECTION_LENGTH = 0;

const FIRST_EVIDENCE_EVENT_INDEX = 0;

const NO_EVENT_ENTRIES = 0;

const FIRST_EVENT_INDEX = 0;

const REQUEST_NAVIGATION_NEXT = 1;

const REQUEST_NAVIGATION_PREVIOUS = -1;

const FINAL_EVENT_INDEX_ADJUSTMENT = 1;

function locatorLabel(event: SessionHistoryEvent): string {
	return `${event.locator.line}:${event.locator.block}`;
}

interface EventLedgerProps {
	readonly events: readonly SessionHistoryEvent[];
	readonly total: number;
	readonly selected: string | undefined;
	readonly onSelect: (id: string) => void;
}

function EventLedger({
	events,
	total,
	selected,
	onSelect,
}: EventLedgerProps): React.JSX.Element {
	const active = selected ?? events[FIRST_EVIDENCE_EVENT_INDEX]?.id;

	return (
		<div
			className="focus-visible:-outline-offset-2"
			role="listbox"
			aria-label="Attempt events"
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === "j" || event.key === "k") {
					event.preventDefault();
					moveEvidenceEvent(
						{ events, onSelect },
						active,
						event.key === "j"
							? REQUEST_NAVIGATION_NEXT
							: REQUEST_NAVIGATION_PREVIOUS,
					);
				}
			}}
		>
			{events.map((event) => (
				<EvidenceEventRow
					key={event.id}
					event={event}
					active={active}
					onSelect={onSelect}
				/>
			))}
			{events.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="px-3 py-2.5 text-14 text-muted-foreground">
					{total === NO_EVENT_ENTRIES
						? "No events are available in this evidence scope."
						: "No events match these filters. Choose All records to include raw chronology."}
				</p>
			) : null}
		</div>
	);
}

function stateGlyph(state: SessionHistoryEvent["state"]): string {
	if (state === "failed") {
		return "×";
	}
	if (state === "partial") {
		return "≈";
	}
	if (state === "unavailable") {
		return "?";
	}
	if (state === "delivered") {
		return "↓";
	}

	return "▶";
}

interface EvidenceEventRowProps {
	readonly event: SessionHistoryEvent;
	readonly active: string | undefined;
	readonly onSelect: EventLedgerProps["onSelect"];
}

function EvidenceEventRow({
	event,
	active,
	onSelect,
}: EvidenceEventRowProps): React.JSX.Element {
	return (
		<button
			type="button"
			role="option"
			aria-selected={event.id === active}
			aria-current={event.id === active ? "true" : undefined}
			className={cn(
				selectableRow({ markedBy: "selected" }),
				"flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5",
			)}
			key={event.id}
			onClick={() => {
				onSelect(event.id);
			}}
		>
			<code className="w-14 shrink-0 font-mono text-12 text-accent-foreground">
				{locatorLabel(event)}
			</code>
			<span className="min-w-0 flex-1">{event.label}</span>
			<small className="shrink-0">
				<span className="text-12 text-muted-foreground">
					<span aria-hidden="true">{stateGlyph(event.state)}</span>{" "}
					{event.state}
				</span>
			</small>
			{event.timestamp === undefined ? null : (
				<time className="basis-full pl-16.5 font-mono text-12 text-muted-foreground">
					{event.timestamp}
				</time>
			)}
		</button>
	);
}

function moveEvidenceEvent(
	request: Pick<EventLedgerProps, "events" | "onSelect">,
	active: string | undefined,
	delta: number,
): void {
	const { events, onSelect } = request;
	const index = Math.max(
		FIRST_EVENT_INDEX,
		events.findIndex(({ id }) => id === active),
	);
	const next =
		events[
			Math.min(
				events.length - FINAL_EVENT_INDEX_ADJUSTMENT,
				Math.max(FIRST_EVENT_INDEX, index + delta),
			)
		];
	if (next !== undefined) {
		onSelect(next.id);
	}
}

export { EventLedger, locatorLabel };
