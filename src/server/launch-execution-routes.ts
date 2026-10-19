import { Hono } from "hono";

import type { Immutable } from "#benchmark/contracts";
import {
	HTTP_STATUS_ACCEPTED,
	HTTP_STATUS_BAD_REQUEST,
} from "#server/http-status";
import controlApi from "#server/launch-control-routes";
import { LaunchRefusalError, asBusyRefusal } from "#server/launch-refusal";
import type {
	LaunchContext,
	LaunchControlContext,
	LaunchEditDependencies,
	LaunchRequest,
} from "#server/launches-contract";
import { parseLaunchRequest } from "#server/launches-launch-request-schema";
import startLaunch from "#server/launches-start-launch";
import startSoleAnalysisOf from "#server/launches-start-sole-analysis-of";
import routes from "#server/route-factory";

function startLaunchHandler({
	dependencies,
	corpusEditGate,
	runsStartingAnalysis,
}: LaunchControlContext) {
	return async (context: LaunchContext<"/api/launches">) => {
		const parsed = await parseLaunchRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		const request = parsed.data;

		try {
			const id = await executeLaunch({
				corpusEditGate,
				dependencies,
				request,
				runsStartingAnalysis,
			});

			return context.json({ id }, HTTP_STATUS_ACCEPTED);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

const executionApi = routes(
	({ dependencies, corpusEditGate }: LaunchEditDependencies) => {
		const runsStartingAnalysis = new Set<string>();
		return new Hono()
			.post(
				"/api/launches",
				startLaunchHandler({
					corpusEditGate,
					dependencies,
					runsStartingAnalysis,
				}),
			)
			.route("/", controlApi(dependencies));
	},
);

interface LaunchExecution extends LaunchControlContext {
	readonly request: Immutable<LaunchRequest>;
}

async function executeLaunch({
	request,
	dependencies,
	corpusEditGate,
	runsStartingAnalysis,
}: LaunchExecution): Promise<string> {
	const start = async (): Promise<string> =>
		await asBusyRefusal(
			async () =>
				await corpusEditGate.starting(
					async () => await startLaunch(request, dependencies),
				),
		);
	const id =
		request.kind === "analysis"
			? await startSoleAnalysisOf(request.run, runsStartingAnalysis, start)
			: await start();

	return id;
}

export { executionApi, executeLaunch };
