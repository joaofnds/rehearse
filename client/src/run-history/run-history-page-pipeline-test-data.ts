import type { PipelineRunRow } from "#server/run-history";

function costMissingPart(part: string): PipelineRunRow["cost"] {
	return {
		missing: [{ part, reason: "no metrics" }],
		parts: [{ part: "build session", usd: 2.41 }],
		state: "available",
		usd: 2.41,
	};
}

export { costMissingPart as default };
