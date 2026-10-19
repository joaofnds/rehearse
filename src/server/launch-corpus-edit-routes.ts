import { Hono } from "hono";

import { needsComparisonManifest } from "#benchmark/baseline-corpus";
import { applyCorpusEdit, reviewCorpusEdit } from "#benchmark/corpus-edit";
import {
	editedCorpus,
	refuseEditUnderLiveLaunch,
} from "#server/corpus-edit-source";
import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_OK } from "#server/http-status";
import {
	LaunchRefusalError,
	asCorpusEditRefusal,
} from "#server/launch-refusal";
import type {
	LaunchContext,
	LaunchDependencies,
	LaunchEditDependencies,
} from "#server/launches-contract";
import { parseCorpusEditRequest } from "#server/launches-corpus-edit-request-schema";
import pairedRerun from "#server/paired-rerun";
import routes from "#server/route-factory";

function reviewCorpusEditHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/corpus/edits/review">) => {
		const parsed = await parseCorpusEditRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			const review = await asCorpusEditRefusal(
				async () =>
					await reviewCorpusEdit(
						dependencies.runsDirectory,
						await editedCorpus(dependencies),
						parsed.data,
					),
			);

			return context.json(
				{
					applyRefusal: review.applyRefusal,
					invalidated: review.invalidated.length,
					startsFrom: review.startsFrom,
				},
				HTTP_STATUS_OK,
			);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

function applyCorpusEditHandler({
	dependencies,
	corpusEditGate,
}: LaunchEditDependencies) {
	return async (context: LaunchContext<"/api/corpus/edits/apply">) => {
		const parsed = await parseCorpusEditRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			const applied = await asCorpusEditRefusal(
				async () =>
					await corpusEditGate.applying(async () => {
						await refuseEditUnderLiveLaunch(dependencies);

						return await applyCorpusEdit(
							dependencies.runsDirectory,
							await editedCorpus(dependencies),
							parsed.data,
						);
					}),
			);

			return context.json(
				{
					invalidated: applied.invalidated.length,
					needsComparisonManifest: needsComparisonManifest(parsed.data.path),
					previous: applied.previous,
					rerun: await pairedRerun(
						dependencies.runsDirectory,
						applied.invalidated,
						parsed.data.path,
					),
					version: applied.version,
				},
				HTTP_STATUS_OK,
			);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

const corpusEditsApi = routes(
	({ dependencies, corpusEditGate }: LaunchEditDependencies) =>
		new Hono()
			.post("/api/corpus/edits/review", reviewCorpusEditHandler(dependencies))
			.post(
				"/api/corpus/edits/apply",
				applyCorpusEditHandler({ corpusEditGate, dependencies }),
			),
);

export { corpusEditsApi as default };
