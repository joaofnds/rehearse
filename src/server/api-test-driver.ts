import type { z } from "zod";

import {
	corpusResponseSchema,
	runHistoryResponseFrom,
} from "#server/api-test-responses";
import type { PipelineRunHistory } from "#server/api-test-responses";

interface ApiTestTransport {
	readonly read: (path: string) => Response | Promise<Response>;
}

interface CorpusResponse {
	readonly response: Response;
	readonly text: string;
	readonly body: z.infer<typeof corpusResponseSchema>;
}

interface HistoryResponse {
	readonly response: Response;
	readonly body: PipelineRunHistory;
}

async function readCorpusResponse(
	app: ApiTestTransport,
): Promise<CorpusResponse> {
	const response = await app.read("/api/corpus");
	const text = await response.text();

	return { body: corpusResponseSchema.parse(JSON.parse(text)), response, text };
}

async function readRunHistoryResponse(
	app: ApiTestTransport,
	path = "/api/runs",
): Promise<HistoryResponse> {
	const response = await app.read(path);
	return { body: await runHistoryResponseFrom(response), response };
}

export { readCorpusResponse, readRunHistoryResponse };
export type { CorpusResponse };
