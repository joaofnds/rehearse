import { join } from "node:path";

import { CONTROL_DIR } from "./config";
import { stageRubricSha256 } from "./judge-agreement";
import type { StageDefinition } from "./pipeline";
import { parseStageRubric } from "./stage-rubric";
import type { JudgedReadEntry } from "./staleness-contract";

function judgeRubricCause(path: string): string {
	return `judge rubric ${path} changed`;
}

/**
 * The hash a rubric has now, the way a stage's scorecard froze it. A rubric
 * that is gone or no longer parses has none, so it reads as changed.
 */
async function rubricHashNow(
	definition: StageDefinition | undefined,
	path: string,
): Promise<string | undefined> {
	if (definition === undefined) {
		return undefined;
	}

	const readCurrentRubric = async (): Promise<string | undefined> => {
		try {
			return await Bun.file(join(CONTROL_DIR, path)).text();
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return undefined;
			}

			throw error;
		}
	};

	const content = await readCurrentRubric();
	if (content === undefined) {
		return undefined;
	}

	try {
		return stageRubricSha256(parseStageRubric(content, definition.kind));
	} catch {
		// Every error a parse raises means the rubric no longer parses.
		return undefined;
	}
}

/**
 * A changed rubric changes the grade, not the version the record read, so it
 * stales the record without moving its distance. A later stage ran only
 * because that grade let it, so the cause reaches it as an upstream one.
 */
function rubricCauses(readManifest: readonly JudgedReadEntry[]): string[] {
	return readManifest
		.filter(({ half, state }) => half === "rubric" && state === "changed")
		.map(({ path }) => judgeRubricCause(path));
}

export { judgeRubricCause, rubricHashNow, rubricCauses };
