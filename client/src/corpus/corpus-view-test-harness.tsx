import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRouter,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";

import stringifyRouteSearch from "#client/route-search";

import type { OpenedCorpusFile } from "./corpus-page";
import CorpusPage from "./corpus-page";

interface ServedCorpusView {
	readonly linked?: OpenedCorpusFile | undefined;
	readonly source?:
		| { readonly run: string; readonly stage: string }
		| undefined;
	readonly client?: QueryClient | undefined;
}

function renderCorpusView({
	linked,
	source,
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}: ServedCorpusView): void {
	const router = createRouter({
		history: createMemoryHistory({ initialEntries: ["/"] }),
		routeTree: createRootRoute({
			component: () => <CorpusPage opened={linked} source={source} />,
		}),
		stringifySearch: stringifyRouteSearch,
	});
	render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

export { renderCorpusView as default };

export type { ServedCorpusView };
