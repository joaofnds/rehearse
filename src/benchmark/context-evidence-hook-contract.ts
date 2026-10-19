import { z } from "zod";

const instructionLoadSchema = z
	.object({
		agentId: z.string().nonempty().nullable(),
		attributionState: z.literal("missing").optional(),
		filePath: z.string().nonempty(),
		globs: z.array(z.string()).optional(),
		loadReason: z.string().nonempty(),
		memoryType: z.string().nonempty(),
		parentFilePath: z.string().nonempty().optional(),
		promptId: z.string().nonempty().nullable(),
		sourceOrdinal: z.number().int().nonnegative(),
		triggerFilePath: z.string().nonempty().optional(),
	})
	.strict()
	.superRefine((load, context) => {
		if ((load.agentId === null) !== (load.attributionState === "missing")) {
			context.addIssue({
				code: "custom",
				message: "load attribution payload contradicts its state",
				path: ["attributionState"],
			});
		}
	});

const compactionSchema = z
	.object({
		agentId: z.string().nonempty().nullable(),
		attributionState: z.literal("missing").optional(),
		phase: z.enum(["pre", "post"]),
		promptId: z.string().nonempty().nullable(),
		sourceOrdinal: z.number().int().nonnegative(),
		summaryAvailable: z.boolean().optional(),
		trigger: z.string().nonempty(),
	})
	.strict()
	.superRefine((compaction, context) => {
		if (
			(compaction.agentId === null) !==
			(compaction.attributionState === "missing")
		) {
			context.addIssue({
				code: "custom",
				message: "compaction attribution payload contradicts its state",
				path: ["attributionState"],
			});
		}
	});

export { instructionLoadSchema, compactionSchema };
