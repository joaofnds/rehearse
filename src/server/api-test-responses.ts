import { createHash } from "node:crypto";

import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";

const corpusFileSchema = z.object({ path: z.string() }).loose();

const availableStalenessSchema = z
	.object({
		causes: z.array(z.string()),
		stale: z.boolean(),
		state: z.literal("available"),
	})
	.loose();

const unavailableStalenessSchema = z.object({
	reasons: z.array(z.string()),
	state: z.literal("unavailable"),
});

const historyRowSchema = z.object({ kind: z.string() }).loose();

const unreadableHistorySchema = z.object({
	id: z.string(),
	kind: z.string(),
	reason: z.string(),
});

const corpusResponseSchema = z.object({
	digest: z.string().optional(),
	files: z.array(corpusFileSchema),
	refusals: z.array(z.string()),
	root: z.string(),
});

const rowStalenessSchema = z.discriminatedUnion("state", [
	availableStalenessSchema,
	unavailableStalenessSchema,
]);

const pipelineRunRowSchema = z
	.object({
		kind: z.literal("run"),
		run: z.string(),
		staleness: rowStalenessSchema,
	})
	.loose();

const runHistoryResponseSchema = z.object({
	rows: z.array(historyRowSchema),
	unreadable: z.array(unreadableHistorySchema),
});

interface PipelineRunHistory {
	readonly rows: readonly z.infer<typeof pipelineRunRowSchema>[];
	readonly unreadable: z.infer<typeof runHistoryResponseSchema>["unreadable"];
}

async function runHistoryResponseFrom(
	response: Response,
): Promise<PipelineRunHistory> {
	const body = runHistoryResponseSchema.parse(await response.json());

	return {
		rows: body.rows
			.filter((row) => row.kind === "run")
			.map((row) => pipelineRunRowSchema.parse(row)),
		unreadable: body.unreadable,
	};
}

function staleCausesOf(
	history: Immutable<PipelineRunHistory>,
): readonly string[] {
	return history.rows.flatMap(({ staleness }) =>
		staleness.state === "available" ? staleness.causes : [],
	);
}

function sha256Hex(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

export {
	sha256Hex,
	corpusResponseSchema,
	runHistoryResponseFrom,
	runHistoryResponseSchema,
	staleCausesOf,
};
export type { PipelineRunHistory };
