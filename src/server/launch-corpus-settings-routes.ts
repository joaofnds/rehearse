import { Hono } from "hono";

import { unlinkCorpus } from "#benchmark/corpus-source";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_OK } from "#server/http-status";
import {
	linkCorpusDirectory,
	measureLinkedCorpus,
	storeSetupCorpus,
} from "#server/launch-corpus-settings";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import {
	parseCorpusLinkRequest,
	parseSetupCorpusRequest,
} from "#server/launch-settings-requests";
import type {
	LaunchContext,
	LaunchDependencies,
} from "#server/launches-contract";
import { settingsReading } from "#server/launches-settings-reading";
import routes from "#server/route-factory";

function linkCorpusHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/settings/corpus">) => {
		const parsed = await parseCorpusLinkRequest({
			home: dependencies.home,
			request: context.req,
		});
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			await asLaunchRefusal(async () => {
				await linkCorpusDirectory(
					dependencies.runsDirectory,
					parsed.data.directory,
				);
			});

			return context.json(await settingsReading(dependencies), HTTP_STATUS_OK);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

function rehashCorpusHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/settings/corpus/rehash">) => {
		try {
			const digest = await measureLinkedCorpus(dependencies.runsDirectory);

			return context.json(
				{ digest, label: corpusVersionLabel(digest) },
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

function unlinkCorpusHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/settings/corpus">) => {
		try {
			await asLaunchRefusal(async () => {
				await unlinkCorpus(dependencies.runsDirectory);
			});

			return context.json(await settingsReading(dependencies), HTTP_STATUS_OK);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

function configureCorpusHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/setup/corpus">) => {
		const parsed = await parseSetupCorpusRequest({
			home: dependencies.home,
			request: context.req,
		});
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			await storeSetupCorpus(dependencies, parsed.data);

			return context.json(await settingsReading(dependencies), HTTP_STATUS_OK);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

const corpusSettingsApi = routes((dependencies: LaunchDependencies) =>
	new Hono()
		.put("/api/settings/corpus", linkCorpusHandler(dependencies))
		.post("/api/settings/corpus/rehash", rehashCorpusHandler(dependencies))
		.delete("/api/settings/corpus", unlinkCorpusHandler(dependencies))
		.put("/api/setup/corpus", configureCorpusHandler(dependencies)),
);

export { corpusSettingsApi as default };
