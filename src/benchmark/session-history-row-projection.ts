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
import { baseEvent, regionFor } from "./session-history-location";
import { measureContent } from "./session-history-measurement";
import {
	historyToolCallSchema,
	historyToolResultSchema,
} from "./session-history-message";
import snapshotFor from "./session-history-snapshots";
import { sourceForCall } from "./session-history-sources";

class RowEventProjection {
	private readonly events: MutableEvent[] = [];
	private readonly issues: string[] = [];
	public constructor(private readonly request: RowEventProjectionRequest) {}
	public observe({ block, value }: HistoryRowBlock): void {
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
	private projectNonCall(
		common: Immutable<CommonEvent>,
		value: JsonValue,
	): void {
		const result = historyToolResultSchema.safeParse(value);
		if (result.success) {
			this.projectResult({ common, result: result.data });
		} else {
			this.projectContent(common, value);
		}
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
	public state(): ProjectionState {
		return { events: this.events, issues: this.issues };
	}
}

export { RowEventProjection as default };
