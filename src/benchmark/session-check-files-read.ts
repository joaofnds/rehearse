import { z } from "zod";

import type { Immutable } from "./contracts";
import type { CheckResult } from "./session-check-result";
import type { ToolUse } from "./transcript";
import { filesRead } from "./transcript";

const EMPTY_COLLECTION_LENGTH = 0;

const filesReadCheckSchema = z
	.object({
		kind: z.literal("files-read"),
		paths: z.array(z.string().nonempty()).nonempty(),
	})
	.strict();

type FilesReadCheck = z.infer<typeof filesReadCheckSchema>;

function evaluateFilesRead(
	check: Immutable<FilesReadCheck>,
	toolUses: Immutable<readonly ToolUse[]>,
): CheckResult {
	const read = filesRead(toolUses);
	const missing = check.paths.filter((path) => !read.includes(path));
	if (missing.length === EMPTY_COLLECTION_LENGTH) {
		return {
			detail: `read ${check.paths.join(", ")}`,
			kind: check.kind,
			status: "PASS",
		};
	}

	return {
		detail: `never read ${missing.join(", ")}`,
		kind: check.kind,
		status: "FAIL",
	};
}

export { filesReadCheckSchema, evaluateFilesRead };
export type { FilesReadCheck };
