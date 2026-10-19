import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import createQueryClient from "#client/query-client";

import createAppRouter from "./router";

import "./system/globals.css";

const root = document.querySelector("#root");

if (root === null) {
	throw new Error("root element not found");
}

const queryClient = createQueryClient();

const router = createAppRouter();

createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);
