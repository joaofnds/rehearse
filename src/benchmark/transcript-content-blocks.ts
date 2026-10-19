import type { TranscriptLocation } from "./transcript-diagnostics-contract";
import type {
	LocatedDiagnosticIssue,
	LocatedToolResult,
	LocatedToolUse,
} from "./transcript-line-contract";
import {
	contentBlockSchema,
	toolResultSchema,
	toolUseSchema,
} from "./transcript-message-contract";

interface LocatedContentBlock {
	readonly value: unknown;
	readonly location: Readonly<TranscriptLocation>;
}

const SUPPORTED_NON_TOOL_BLOCKS = new Set([
	"image",
	"redacted_thinking",
	"text",
	"thinking",
]);

class LocatedContentBlocks {
	public readonly locatedToolUses: LocatedToolUse[] = [];
	public readonly locatedToolResults: LocatedToolResult[] = [];
	public readonly diagnosticIssues: LocatedDiagnosticIssue[] = [];
	public observe(observation: LocatedContentBlock): void {
		const { value, location } = observation;
		const typed = contentBlockSchema.safeParse(value);
		if (!typed.success) {
			this.diagnosticIssues.push({
				kind: "unsupported-content-block",
				location,
			});
			return;
		}
		this.observeTyped(typed.data.type, observation);
	}
	private observeTyped(type: string, observation: LocatedContentBlock): void {
		const { location } = observation;
		switch (type) {
			case "tool_use": {
				this.observeToolUse(observation);
				break;
			}
			case "tool_result": {
				this.observeToolResult(observation);
				break;
			}
			default: {
				if (!SUPPORTED_NON_TOOL_BLOCKS.has(type)) {
					this.diagnosticIssues.push({
						kind: "unsupported-content-block",
						location,
					});
				}
			}
		}
	}
	private observeToolUse({ value, location }: LocatedContentBlock): void {
		const use = toolUseSchema.safeParse(value);
		if (use.success) {
			this.locatedToolUses.push({
				location,
				toolUseId: use.data.id,
				use: use.data,
			});
		} else {
			this.diagnosticIssues.push({ kind: "invalid-tool-use", location });
		}
	}
	private observeToolResult({ value, location }: LocatedContentBlock): void {
		const result = toolResultSchema.safeParse(value);
		if (result.success) {
			this.locatedToolResults.push({
				isError: result.data.is_error === true,
				location,
				toolUseId: result.data.tool_use_id,
			});
		} else {
			this.diagnosticIssues.push({ kind: "invalid-tool-result", location });
		}
	}
}

export { LocatedContentBlocks as default };
