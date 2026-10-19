import type { Immutable } from "#benchmark/contracts";
import type {
	TaskBundlePreview,
	ValidatedTaskBundle,
} from "#server/task-bundle-contract";

function previewTaskBundle(
	bundle: Immutable<ValidatedTaskBundle>,
): TaskBundlePreview {
	const pipeline = bundle.pipeline.definition;

	return {
		caseId: bundle.caseId,
		commands: [...(pipeline.target.setup ?? []), ...pipeline.target.checks].map(
			({ command }) => command.join(" "),
		),
		model: bundle.model ?? null,
		services: (pipeline.target.services ?? []).map(
			({ name, image, exports }) => ({
				exports: Object.keys(exports),
				image,
				name,
			}),
		),
		stepJudges: new Set(pipeline.stages.map(({ rubric }) => rubric)).size,
		steps: pipeline.stages.map(({ name, kind, skill }) => ({
			kind,
			name,
			skill,
		})),
		targetPath: bundle.target.path,
		title: bundle.title,
	};
}

export { previewTaskBundle as default };
