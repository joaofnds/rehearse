import { z } from "zod";

const UNAVAILABLE = { state: "unavailable" } as const;

const instructionFileSchema = z
	.object({
		path: z.string().min(1),
		type: z.string().min(1),
	})
	.loose();

export const instructionsAttachmentSchema = z
	.object({
		attachment: z
			.object({
				type: z.literal("instructions"),
				files: z.array(instructionFileSchema),
			})
			.loose(),
	})
	.loose();

export interface TranscriptInstructionLoad {
	readonly filePath: string;
	readonly memoryType: string;
	readonly loadReason: typeof UNAVAILABLE;
	readonly triggerFilePath: typeof UNAVAILABLE;
	readonly parentFilePath: typeof UNAVAILABLE;
}

export type TranscriptInstructionLoads =
	| {
			readonly state: "available";
			readonly loads: readonly TranscriptInstructionLoad[];
	  }
	| { readonly state: "unavailable" };

/**
 * The attachment names the file and its memory type and nothing else. Why the
 * file loaded, what triggered it and which file included it are absent from
 * the transcript, so they report unavailable rather than a guess a reader
 * would take for evidence.
 */
export function transcriptInstructionLoads(
	transcript: string,
): TranscriptInstructionLoads {
	return settledLoads(
		transcript.split("\n").map((line) => attachmentLoads(line)),
	);
}

export async function transcriptInstructionLoadsFromLines(
	lines: AsyncIterable<string>,
): Promise<TranscriptInstructionLoads> {
	const readings: (readonly TranscriptInstructionLoad[] | undefined)[] = [];
	for await (const line of lines) {
		readings.push(attachmentLoads(line));
	}

	return settledLoads(readings);
}

/** Undefined means the line is not an instructions attachment at all. */
function attachmentLoads(
	line: string,
): readonly TranscriptInstructionLoad[] | undefined {
	if (line.trim() === "") {
		return undefined;
	}
	let row: unknown;
	try {
		row = JSON.parse(line);
	} catch {
		return undefined;
	}
	const parsed = instructionsAttachmentSchema.safeParse(row);
	if (!parsed.success) {
		return undefined;
	}

	return parsed.data.attachment.files.map((file) => ({
		filePath: file.path,
		memoryType: file.type,
		loadReason: UNAVAILABLE,
		triggerFilePath: UNAVAILABLE,
		parentFilePath: UNAVAILABLE,
	}));
}

function settledLoads(
	readings: readonly (readonly TranscriptInstructionLoad[] | undefined)[],
): TranscriptInstructionLoads {
	const attached = readings.filter((reading) => reading !== undefined);
	if (attached.length === 0) {
		return UNAVAILABLE;
	}

	return { state: "available", loads: attached.flat() };
}
