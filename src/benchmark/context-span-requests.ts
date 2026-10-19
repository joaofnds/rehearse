import { objectValue, stringValue } from "./context-evidence-values";
import { recordNormalizationIssue } from "./context-normalization-issues";
import type { NormalizationIssues } from "./context-normalization-issues";
import {
	addCandidate,
	addRow,
	qualifiedIdentity,
} from "./context-transcript-index";
import type { JsonObject } from "./json-value";

interface SpanRequestCollection {
	readonly byRequest: ReadonlyMap<string, readonly Readonly<JsonObject>[]>;
	readonly agentCandidates: ReadonlyMap<string, ReadonlySet<string>>;
}
class SpanRequests {
	private readonly byRequest = new Map<string, Readonly<JsonObject>[]>();
	private readonly agentCandidates = new Map<string, Set<string>>();
	public constructor(private readonly issues: Readonly<NormalizationIssues>) {}
	private collectIdentifiedSpan(
		span: Readonly<JsonObject>,
		attributes: Readonly<JsonObject>,
	): void {
		const sessionId = stringValue(attributes, "session.id") ?? null;
		const requestId = stringValue(attributes, "request_id");
		if (requestId === undefined) {
			recordNormalizationIssue(this.issues, {
				detail: "llm_request span has no request identity",
				record: span,
				stream: "otelSpans",
			});
			return;
		}
		const key = qualifiedIdentity(sessionId, requestId);
		addRow(this.byRequest, key, span);
		const agentId = stringValue(attributes, "agent_id");
		if (agentId !== undefined) {
			addCandidate(this.agentCandidates, key, agentId);
		}
	}
	private collect(span: Readonly<JsonObject>): void {
		if (stringValue(span, "name") !== "claude_code.llm_request") {
			return;
		}
		const attributes = objectValue(span, "attributes");
		if (attributes === undefined) {
			recordNormalizationIssue(this.issues, {
				detail: "llm_request span has no attributes",
				record: span,
				stream: "otelSpans",
			});
			return;
		}
		this.collectIdentifiedSpan(span, attributes);
	}
	public collectAll(
		spans: readonly Readonly<JsonObject>[],
	): SpanRequestCollection {
		for (const span of spans) {
			this.collect(span);
		}
		return { agentCandidates: this.agentCandidates, byRequest: this.byRequest };
	}
}
function collectRequestSpans(
	spans: readonly Readonly<JsonObject>[],
	issues: Readonly<NormalizationIssues>,
): SpanRequestCollection {
	return new SpanRequests(issues).collectAll(spans);
}
export { collectRequestSpans as default };

export type { SpanRequestCollection };
