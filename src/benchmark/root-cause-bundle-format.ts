import orderedJson from "./ordered-json";
import type { RootCauseBundle } from "./root-cause-bundle";

/** The provider prompt and its saved digest retain their historical field order. */
function serializeRootCauseBundle(bundle: RootCauseBundle): string {
	const json = JSON.stringify(bundle);
	return orderedJson({
		json,
		order: {
			children: {
				corpusFiles: { fields: ["path", "sha256", "body", "readBy"] },
				outcome: { fields: ["status", "verdict", "summary", "stage", "error"] },
				stages: {
					fields: [
						"stage",
						"grade",
						"stopped",
						"commitSubjects",
						"changedPaths",
						"corpusReads",
					],
				},
			},
			fields: [
				"run",
				"caseId",
				"task",
				"productBrief",
				"declaredStages",
				"stages",
				"outcome",
				"corpusFiles",
			],
		},
		space: 0,
	});
}

export { serializeRootCauseBundle as default };
