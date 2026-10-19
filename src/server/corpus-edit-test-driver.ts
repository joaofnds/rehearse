import { expect } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import CORPUS_VERSION_HEADER from "./corpus-version-header";

async function applyReviewedEdit(
	served: Readonly<{ driver: CorpusEditDriver }>,
	edit: EditRequest,
): Promise<z.infer<typeof appliedSchema>> {
	const review = await served.driver.review(edit);

	return await served.driver.apply({ ...edit, startsFrom: review.startsFrom });
}

const reviewSchema = z.object({
	applyRefusal: z.string().nullable(),
	invalidated: z.number(),
	startsFrom: z.string(),
});

const rerunOfferSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("offered"),
		run: z.string(),
		stage: z.string(),
	}),
	z.object({ kind: z.literal("none"), reason: z.string() }),
]);

const appliedSchema = z.object({
	invalidated: z.number(),
	needsComparisonManifest: z.boolean(),
	previous: z.string(),
	rerun: rerunOfferSchema,
	version: z.string(),
});

const corpusSchema = z.object({
	digest: z.string().nullable(),
	lastEdit: z.unknown(),
});

interface EditRequest {
	readonly path: string;
	readonly text: string;
}

/** An edit, carrying the version it was opened or reviewed against. */
interface ReviewedRequest extends EditRequest {
	readonly startsFrom: string;
}

interface ReplayRequest {
	readonly kind: "replay";
	readonly run: string;
	readonly stage: string;
	readonly attempts: number;
}

/** A read, or a same-origin JSON write when it carries a body. */
type Send = (path: string, body?: string) => Promise<Response>;

/** A version digest no linked directory holds. */
const NO_VERSION = "0".repeat(SHA256_HEX_DIGITS);

/** The corpus screen's view of the server: its reads and its edit writes. */
class CorpusEditDriver {
	public constructor(private readonly send: Send) {}

	public async openRaw(path: string): Promise<Response> {
		return await this.send(`/api/corpus/file?path=${encodeURIComponent(path)}`);
	}

	/** The version the corpus held when the screen opened the file. */
	public async opened(path: string): Promise<string> {
		const response = await this.openRaw(path);
		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		return z.string().parse(response.headers.get(CORPUS_VERSION_HEADER));
	}

	public async reviewRaw(edit: ReviewedRequest): Promise<Response> {
		return await this.send("/api/corpus/edits/review", JSON.stringify(edit));
	}

	/** Opens the file, as the screen does, and reviews the edit against it. */
	public async review(
		edit: EditRequest,
	): Promise<z.infer<typeof reviewSchema>> {
		const response = await this.reviewRaw({
			...edit,
			startsFrom: await this.opened(edit.path),
		});
		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		return reviewSchema.parse(await response.json());
	}

	public async applyRaw(edit: ReviewedRequest): Promise<Response> {
		return await this.send("/api/corpus/edits/apply", JSON.stringify(edit));
	}

	public async apply(
		edit: ReviewedRequest,
	): Promise<z.infer<typeof appliedSchema>> {
		const response = await this.applyRaw(edit);
		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		return appliedSchema.parse(await response.json());
	}

	public async version(digest: string): Promise<Response> {
		return await this.send(`/api/corpus/versions/${digest}`);
	}

	public async launch(request: ReplayRequest): Promise<Response> {
		return await this.send("/api/launches", JSON.stringify(request));
	}

	public async corpus(): Promise<z.infer<typeof corpusSchema>> {
		const response = await this.send("/api/corpus");
		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		return corpusSchema.parse(await response.json());
	}
}

interface AppRequests {
	readonly request: (
		path: string,
		init?: RequestInit,
	) => Promise<Response> | Response;
}

function corpusEditDriver(app: AppRequests, host: string): CorpusEditDriver {
	return new CorpusEditDriver(
		async (path, body) =>
			await Promise.resolve(
				body === undefined
					? app.request(path, { headers: { host } })
					: app.request(path, {
							body,
							headers: {
								"content-type": "application/json",
								host,
								origin: `http://${host}`,
								"sec-fetch-site": "same-origin",
							},
							method: "POST",
						}),
			),
	);
}

export { corpusEditDriver, applyReviewedEdit, NO_VERSION, CorpusEditDriver };

export type { EditRequest };
