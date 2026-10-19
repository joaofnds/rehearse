import { z } from "zod";

import { MissingRunManifestError } from "#benchmark/manifest";

const filesystemReadErrorSchema = z.looseObject({
	code: z.string(),
	errno: z.number(),
	path: z.string(),
	syscall: z.string(),
});

async function readOptionalRecord<Read>(
	read: () => Promise<Read>,
): Promise<Read | undefined> {
	try {
		return await read();
	} catch (error) {
		if (
			error instanceof SyntaxError ||
			error instanceof z.ZodError ||
			error instanceof MissingRunManifestError ||
			(error instanceof Error &&
				filesystemReadErrorSchema.safeParse(error).success)
		) {
			return undefined;
		}

		throw error;
	}
}

export { readOptionalRecord as default };
