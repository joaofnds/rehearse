import { createRootRoute, createRoute } from "@tanstack/react-router";
import { z } from "zod";

import CasesPage from "#client/cases/cases-page";
import CorpusPage from "#client/corpus/corpus-page";
import type { CorpusSearch } from "#client/corpus/corpus-search";
import corpusSearchSchema from "#client/corpus/corpus-search";
import SettingsPage from "#client/settings/settings-page";
import AppShell from "#client/shell/app-shell";
import NotFoundPage from "#client/shell/not-found-page";
import TasksPage from "#client/tasks/tasks-page";

const rootRoute = createRootRoute({
	component: AppShell,
	notFoundComponent: NotFoundPage,
});

const corpusRoute = createRoute({
	component: CorpusRoute,
	getParentRoute: () => rootRoute,
	path: "/corpus",
	validateSearch: corpusSearchSchema,
});

function CorpusRoute(): React.JSX.Element {
	const { file, start, end, sourceRun, sourceStep }: CorpusSearch =
		corpusRoute.useSearch();
	const lines = start === undefined ? undefined : { end: end ?? start, start };

	return (
		<CorpusPage
			key={`${file}:${sourceRun}:${sourceStep}`}
			opened={file === undefined ? undefined : { lines, path: file }}
			source={
				sourceRun === undefined || sourceStep === undefined
					? undefined
					: { run: sourceRun, stage: sourceStep }
			}
		/>
	);
}

const SECTION_SEARCH = z.object({
	caseId: z.string().optional(),
	view: z.string().optional(),
});

const settingsRoute = createRoute({
	component: SettingsRoute,
	getParentRoute: () => rootRoute,
	path: "/settings",
	validateSearch: SECTION_SEARCH,
});

function SettingsRoute(): React.JSX.Element {
	const { view }: z.output<typeof SECTION_SEARCH> = settingsRoute.useSearch();
	return <SettingsPage view={view === "judges" ? "judges" : "general"} />;
}

const tasksRoute = createRoute({
	component: TasksPage,
	getParentRoute: () => rootRoute,
	path: "/tasks",
});

const CASES_SEARCH = SECTION_SEARCH.extend({
	corpusVersion: z.string().optional(),
});

const casesRoute = createRoute({
	component: CasesRoute,
	getParentRoute: () => rootRoute,
	path: "/cases",
	validateSearch: CASES_SEARCH,
});

function CasesRoute(): React.JSX.Element {
	const { view, caseId, corpusVersion }: z.output<typeof CASES_SEARCH> =
		casesRoute.useSearch();
	return (
		<CasesPage
			view={view === "workflows" ? "workflows" : "cases"}
			{...(caseId === undefined ? {} : { caseId })}
			{...(corpusVersion === undefined ? {} : { corpusVersion })}
		/>
	);
}

export { casesRoute, corpusRoute, rootRoute, settingsRoute, tasksRoute };
