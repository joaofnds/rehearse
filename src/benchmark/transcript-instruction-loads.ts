import { z } from "zod";

import parseJsonDocument from "./json-document";

const EMPTY_COLLECTION_LENGTH = 0;

const UNAVAILABLE = { state: "unavailable" } as const;

const instructionFileSchema = z
	.object({
		path: z.string().nonempty(),
		type: z.string().nonempty(),
	})
	.loose();

const instructionsAttachmentSchema = z
	.object({
		attachment: z
			.object({
				files: z.array(instructionFileSchema),
				type: z.literal("instructions"),
			})
			.loose(),
		type: z.literal("attachment"),
	})
	.loose();

interface TranscriptInstructionLoad {
	readonly filePath: string;
	readonly memoryType: string;
	readonly loadReason: typeof UNAVAILABLE;
	readonly triggerFilePath: typeof UNAVAILABLE;
	readonly parentFilePath: typeof UNAVAILABLE;
}

type TranscriptInstructionLoads =
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
function transcriptInstructionLoads(
	transcript: string,
): TranscriptInstructionLoads {
	return settledLoads(
		transcript.split("\n").map((line) => attachmentLoads(line)),
	);
}

async function transcriptInstructionLoadsFromLines(
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
	const documentReading = parseJsonDocument(line, instructionsAttachmentSchema);
	if (documentReading.kind === "invalid-json") {
		return undefined;
	}
	const { parsed } = documentReading;
	if (!parsed.success) {
		return undefined;
	}

	return parsed.data.attachment.files.map((file) => ({
		filePath: file.path,
		loadReason: UNAVAILABLE,
		memoryType: file.type,
		parentFilePath: UNAVAILABLE,
		triggerFilePath: UNAVAILABLE,
	}));
}

function settledLoads(
	readings: readonly (readonly TranscriptInstructionLoad[] | undefined)[],
): TranscriptInstructionLoads {
	const attached = readings.filter((reading) => reading !== undefined);
	if (attached.length === EMPTY_COLLECTION_LENGTH) {
		return UNAVAILABLE;
	}

	return { loads: attached.flat(), state: "available" };
}

export {
	instructionsAttachmentSchema,
	transcriptInstructionLoads,
	transcriptInstructionLoadsFromLines,
};
export type { TranscriptInstructionLoad, TranscriptInstructionLoads };
