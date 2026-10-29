import { unhandled } from "./contracts";
import type { Immutable } from "./contracts";
import type { JsonValue } from "./json-value";
import contentBlockEvent from "./session-history-content-events";
import type {
	CommonEvent,
	HistoryRowBlock,
	MutableEvent,
	ProjectedCall,
	ProjectedResult,
	ProjectionState,
	RowEventProjectionRequest,
} from "./session-history-event-contract";
import { baseEvent, locatorId, regionFor } from "./session-history-location";
import { measureContent } from "./session-history-measurement";
import {
	historyThinkingBlockSchema,
	historyToolCallSchema,
	historyToolResultSchema,
} from "./session-history-message";
import {
	attachmentEvent,
	thinkingEvent,
} from "./session-history-provider-events";
import snapshotFor from "./session-history-snapshots";
import { sourceForCall } from "./session-history-sources";

const ATTACHMENT_BLOCK_NUMBER = 1;

const TRANSCRIPT_BLOCK_NUMBER_BASE = 1;

class RowEventProjection {
	private readonly events: MutableEvent[] = [];
	private readonly issues: string[] = [];
	public constructor(private readonly request: RowEventProjectionRequest) {}
	public project(): ProjectionState {
		this.observeRow();

		return { events: this.events, issues: this.issues };
	}
	private observeRow(): void {
		const { reading } = this.request.row;
		switch (reading.kind) {
			case "metadata": {
				break;
			}
			case "attachment": {
				this.observeAttachment(reading.attachmentKind);
				break;
			}
			case "unreadable": {
				this.observeUnreadableBlocks();
				break;
			}
			case "turn": {
				this.observeTurnBlocks();
				break;
			}
			default: {
				unhandled(reading, "history row reading");
			}
		}
	}
	private observeTurnBlocks(): void {
		for (const block of this.numberedBlocks()) {
			this.observe(block);
		}
	}
	private observeUnreadableBlocks(): void {
		for (const block of this.numberedBlocks()) {
			this.issues.push(
				`unsupported content at ${locatorId({ block: block.block, line: this.request.row.line })}`,
			);
			this.observe(block);
		}
	}
	private numberedBlocks(): readonly HistoryRowBlock[] {
		return this.request.row.blocks.map((value, index) => ({
			block: index + TRANSCRIPT_BLOCK_NUMBER_BASE,
			value,
		}));
	}
	private observe({ block, value }: HistoryRowBlock): void {
		const { row, input } = this.request;
		const location = { block, line: row.line };
		const common = baseEvent(
			row,
			block,
			regionFor(row.line, input.prefixLinesExcluded),
		);
		const call = historyToolCallSchema.safeParse(value);
		if (call.success) {
			this.projectCall({ call: call.data, common, location });
		} else {
			this.projectNonCall(common, value);
		}
	}
	private observeAttachment(attachmentKind: string): void {
		const { row, input } = this.request;
		const common = baseEvent(
			row,
			ATTACHMENT_BLOCK_NUMBER,
			regionFor(row.line, input.prefixLinesExcluded),
		);
		this.events.push(attachmentEvent(common, attachmentKind));
	}
	private projectNonCall(
		common: Immutable<CommonEvent>,
		value: JsonValue,
	): void {
		const result = historyToolResultSchema.safeParse(value);
		if (result.success) {
			this.projectResult({ common, result: result.data });
			return;
		}

		const thinking = historyThinkingBlockSchema.safeParse(value);
		if (thinking.success) {
			this.events.push(
				thinkingEvent(common, thinking.data, this.request.retainBodies),
			);
			return;
		}

		this.projectContent(common, value);
	}
	private projectCall({ common, location, call }: ProjectedCall): void {
		const { row, input } = this.request;
		const { name: toolName, input: inputRecord } = call;
		const source = sourceForCall(
			{ input: inputRecord, toolName },
			{ cwd: row.cwd, location },
			{
				kind: input.attempt.kind,
				resolvedCorpusFiles: input.resolvedCorpusFiles,
			},
		);
		this.events.push({
			...common,
			input: inputRecord,
			isDelivery: false,
			kind: "call",
			label: `${toolName} invoked`,
			measurement: {
				reasons: ["tool invocation carries no result content"],
				state: "unavailable",
			},
			source,
			sourceId: source.id,
			state: "invoked",
			toolName,
			toolUseId: call.id,
		});
	}
	private projectResult({ common, result }: ProjectedResult): void {
		const { row, retainBodies } = this.request;
		const measured = measureContent(result.content);
		const snapshot = snapshotFor(row);
		this.events.push({
			...common,
			content: retainBodies ? measured.text : undefined,
			isDelivery: false,
			kind: "result",
			label: result.is_error === true ? "Tool result · failed" : "Tool result",
			measurement: measured.measurement,
			snapshot: retainBodies ? snapshot.text : undefined,
			snapshotMeasurement: snapshot.measurement,
			snapshotRange: snapshot.range,
			source: undefined,
			state: result.is_error === true ? "failed" : "recorded",
			toolUseId: result.tool_use_id,
		});
	}
	private projectContent(
		common: Immutable<CommonEvent>,
		value: JsonValue,
	): void {
		const { row, retainBodies } = this.request;
		const event = contentBlockEvent(
			common,
			{ row: row.value, value },
			retainBodies,
		);
		this.events.push(event);
		if (event.measurement.state !== "complete") {
			this.issues.push(`unsupported content at ${common.id}`);
		}
	}
}

export { RowEventProjection as default };
