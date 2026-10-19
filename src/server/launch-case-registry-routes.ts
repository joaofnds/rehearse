import { Hono } from "hono";

import { linkedCorpusSource } from "#benchmark/corpus-source";
import { DeclarationRefusalError, declareCase } from "#server/case-declaration";
import parseCaseDeclarationRequest from "#server/case-declaration-request";
import caseListing from "#server/case-listing";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CREATED,
} from "#server/http-status";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import type {
	LaunchContext,
	LaunchDependencies,
} from "#server/launches-contract";
import routes from "#server/route-factory";

function listCasesHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/cases">) =>
		context.json(
			await caseListing({
				casesRoot: dependencies.casesRoot,
				liveness: dependencies.liveness,
				runsDirectory: dependencies.runsDirectory,
			}),
		);
}

function declareCaseHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/cases">) => {
		const parsed = await parseCaseDeclarationRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			const corpus = await asLaunchRefusal(
				async () => await linkedCorpusSource(dependencies.runsDirectory),
			);

			return context.json(
				await declareCase(parsed.data, dependencies.casesRoot, corpus),
				HTTP_STATUS_CREATED,
			);
		} catch (error) {
			if (
				!(error instanceof DeclarationRefusalError) &&
				!(error instanceof LaunchRefusalError)
			) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

const caseRegistryApi = routes((dependencies: LaunchDependencies) =>
	new Hono()
		.get("/api/cases", listCasesHandler(dependencies))
		.post("/api/cases", declareCaseHandler(dependencies)),
);

export { caseRegistryApi as default };
