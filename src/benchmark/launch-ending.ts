import { z } from "zod";

import { launchPaths } from "./run-layout";
import writeWholeJsonFile from "./whole-json-file";

/**
 * A `CommandError` carries the failed command's whole stderr, and the reason
 * opens the message, so only its start is kept.
 */
const MESSAGE_LIMIT_BYTES = 4096;

const KEPT_START_BYTE = 0;

const CUT_MARK = "\n[cut]";

const launchEndingSchema = z
	.object({
		endedAt: z.iso.datetime(),
		exitCode: z.number().int(),
		message: z.string(),
	})
	.strict();

/** How a browser launch's command ended by an error, as the command saw it. */
type LaunchEnding = z.infer<typeof launchEndingSchema>;

function keptMessage(message: string): string {
	const bytes = new TextEncoder().encode(message);
	if (bytes.length <= MESSAGE_LIMIT_BYTES) {
		return message;
	}

	// A streaming decode holds back a character the cut split, rather than
	// ending the message on a replacement character.
	const kept = new TextDecoder().decode(
		bytes.subarray(KEPT_START_BYTE, MESSAGE_LIMIT_BYTES),
		{ stream: true },
	);

	return `${kept}${CUT_MARK}`;
}

async function writeLaunchEnding(
	runsDirectory: string,
	id: string,
	ending: Readonly<LaunchEnding>,
): Promise<void> {
	await writeWholeJsonFile(launchPaths(runsDirectory, id).endingFile, {
		...ending,
		message: keptMessage(ending.message),
	});
}

/** The launch's ending, or undefined while its command has not ended by an error. */
async function readLaunchEnding(
	runsDirectory: string,
	id: string,
): Promise<LaunchEnding | undefined> {
	const file = Bun.file(launchPaths(runsDirectory, id).endingFile);
	if (!(await file.exists())) {
		return undefined;
	}

	return launchEndingSchema.parse(await file.json());
}

export { writeLaunchEnding, readLaunchEnding };
export type { LaunchEnding };
