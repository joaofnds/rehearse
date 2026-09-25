import { afterEach, describe, expect, it } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { apiClient } from "#client/api-client";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { CorpusPage } from "./corpus-page";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type CorpusResponse = InferResponseType<typeof apiClient.api.corpus.$get>;

function corpusResponseBody(): CorpusResponse {
	return {
		root: "/home/user/.claude",
		digest: `a41c7e${"0".repeat(58)}`,
		files: [
			{
				path: "CLAUDE.md",
				sha256: "0".repeat(64),
				lastEditedAt: "2026-09-04T09:41:00.000Z",
				readBy: 23,
			},
		],
		refusals: [],
	};
}

function renderPage(): void {
	stubFetchByPath(new Map([["/api/corpus", corpusResponseBody()]]));
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<CorpusPage />
		</QueryClientProvider>,
	);
}

describe(CorpusPage.name, () => {
	it("renders the corpus root unredacted", async () => {
		renderPage();

		await waitFor(() => {
			expect(screen.getByText("/home/user/.claude")).toBeInTheDocument();
		});
	});

	it("labels the current version 'corpus@' over its first six characters, as run history does", async () => {
		renderPage();

		await waitFor(() => {
			expect(screen.getByText("corpus@a41c7e")).toBeInTheDocument();
		});
		expect(screen.queryByText(/corpus root@/u)).toBeNull();
	});

	it("renders one row per file with its path, hash, last-edited time, and read-by count", async () => {
		renderPage();

		await waitFor(() => {
			expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
		});
		expect(screen.getByText("23")).toBeInTheDocument();
	});

	it("renders the planned-feature block for the disabled edit-instruction workflow", async () => {
		renderPage();

		await waitFor(() => {
			expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
		});
		expect(screen.getByText("PLANNED")).toBeInTheDocument();
	});

	describe("when the report carries a refusal", () => {
		function renderRefusing(
			files: CorpusResponse["files"],
			refusals: CorpusResponse["refusals"] = [
				"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			],
		): void {
			const body: CorpusResponse = {
				root: "/home/user/.claude",
				digest: undefined,
				files,
				refusals,
			};
			stubFetchByPath(new Map([["/api/corpus", body]]));
			const client = new QueryClient({
				defaultOptions: { queries: { retry: false } },
			});
			render(
				<QueryClientProvider client={client}>
					<CorpusPage />
				</QueryClientProvider>,
			);
		}

		it("says what was left out without calling every refusal a layout directory, since CLAUDE.md is not one", async () => {
			renderRefusing(corpusResponseBody().files);

			await waitFor(() => {
				expect(
					screen.getByText(
						"These entries could not be hashed, so they are missing from the table, and a refused layout directory is missing from it whole:",
					),
				).toBeInTheDocument();
			});
		});

		it("renders the files it could hash alongside the refusal, rather than one failure line", async () => {
			renderRefusing(corpusResponseBody().files);

			await waitFor(() => {
				expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
			});
			expect(
				within(screen.getByRole("alert")).getByText(
					/agents\/escape\.md resolves outside the tree/u,
				),
			).toBeInTheDocument();
			expect(screen.queryByText("Could not load the corpus.")).toBeNull();
		});

		it("renders no corpus version, since the report carries none for a partial tree", async () => {
			renderRefusing(corpusResponseBody().files);

			await waitFor(() => {
				expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
			});
			expect(screen.queryByText(/corpus@/u)).toBeNull();
		});

		it("renders every refusal, so a benign entry sorting first cannot hide a hostile one", async () => {
			renderRefusing(corpusResponseBody().files, [
				"agents/aardvark.md is a link whose target is missing, so the bytes it names cannot be read",
				"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			]);

			const alert = await screen.findByRole("alert");

			expect(within(alert).getAllByRole("listitem")).toHaveLength(2);
			expect(
				within(alert).getByText(
					/agents\/escape\.md resolves outside the tree/u,
				),
			).toBeInTheDocument();
		});

		it("renders the refusal rather than the empty state when no layout directory hashed", async () => {
			renderRefusing([]);

			await waitFor(() => {
				expect(
					screen.getByText(/agents\/escape\.md resolves outside the tree/u),
				).toBeInTheDocument();
			});
			expect(screen.queryByText("No corpus files found")).toBeNull();
		});
	});

	it("renders the empty state instead of a table when the corpus tree holds no files", async () => {
		stubFetchByPath(
			new Map([
				[
					"/api/corpus",
					{
						root: "/home/user/.claude",
						digest: "e3b0c4",
						files: [],
						refusals: [],
					},
				],
			]),
		);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<CorpusPage />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("No corpus files found")).toBeInTheDocument();
		});
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
	});
});
