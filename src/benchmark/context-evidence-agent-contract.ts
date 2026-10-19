import { z } from "zod";

const MINIMUM_CORROBORATING_SOURCES = 2;

const agentEvidenceSchema = z
	.object({
		agentId: z.string().nonempty(),
		lineageState: z.enum(["complete", "single-source", "missing", "conflict"]),
		parentAgentId: z.string().nonempty().nullable(),
		sources: z.array(z.enum(["stream", "trace"])),
	})
	.strict()
	.superRefine((agent, context) => {
		const expectsParent =
			agent.lineageState === "complete" ||
			agent.lineageState === "single-source";
		if (expectsParent !== (agent.parentAgentId !== null)) {
			context.addIssue({
				code: "custom",
				message: "parent payload contradicts lineage state",
				path: ["parentAgentId"],
			});
		}
		if (
			agent.lineageState === "complete" &&
			agent.sources.length < MINIMUM_CORROBORATING_SOURCES
		) {
			context.addIssue({
				code: "custom",
				message: "complete lineage requires corroborating sources",
				path: ["sources"],
			});
		}
	});

export { agentEvidenceSchema as default };
