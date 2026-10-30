import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { jsonObjectSchema } from "./json-value";
import { prepareActualSetup } from "./session-setup";
import type { ActualSetupFiles } from "./session-setup";
import type { WorkflowStageRequest } from "./workflow-contract";

/**
 * Runs `session` with the files that carry the user's actual setup when the
 * request asks for it, and with none otherwise. The merged settings file holds
 * the stage's declared overlay over the user's settings, and it is removed
 * when the session ends, since it copies the user's settings values.
 */
async function withStageSetup<Result>(
	request: WorkflowStageRequest,
	home: string,
	session: (setup?: ActualSetupFiles) => Promise<Result>,
): Promise<Result> {
	if (request.setup !== "actual") {
		return await session();
	}

	const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-setup-"));
	try {
		const { files } = await prepareActualSetup({
			declared: jsonObjectSchema.parse(
				JSON.parse(request.settingsOverlay ?? "{}"),
			),
			directory,
			env: request.environment ?? {},
			home,
		});

		return await session(files);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
}

export { withStageSetup as default };
