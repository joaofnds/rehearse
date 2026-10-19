import type { InferResponseType } from "hono/client";
import { z } from "zod";

import { launchClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import refusalReason from "#client/refusal-reason";

const previewRoute = launchClient.api["task-bundles"].preview;

type BundlePreview = InferResponseType<
	typeof previewRoute.$post,
	typeof HTTP_STATUS.ok
>;

class BundleRefusedError extends Error {
	public override name = "BundleRefusedError";
}

/** A relative path, which the typed client's `$url` cannot build. */
function bundleUrl(caseId: string): string {
	return `/api/cases/${encodeURIComponent(caseId)}/bundle`;
}

/** Any JSON document, which the server judges as a bundle. */
const JSON_DOCUMENT = z.json();

type JsonDocument = z.infer<typeof JSON_DOCUMENT>;

/** The file's text as JSON, so a file that is not JSON is named here rather than by the server's parser. */
function bundleDocument(text: string): JsonDocument {
	try {
		return JSON_DOCUMENT.parse(JSON.parse(text));
	} catch {
		throw new BundleRefusedError(
			"The file is not JSON, so it is no workflow bundle",
		);
	}
}

async function previewBundle(text: string): Promise<BundlePreview> {
	const response = await previewRoute.$post(undefined, {
		headers: { "Content-Type": "application/json" },
		init: { body: JSON.stringify({ bundle: bundleDocument(text) }) },
	});
	if (response.status !== HTTP_STATUS.ok) {
		throw new BundleRefusedError(await refusalReason(response));
	}

	return await response.json();
}

interface ImportDraft {
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
}

interface ImportRequest extends ImportDraft {
	readonly bundleText: string;
}

async function importBundle(request: ImportRequest): Promise<string> {
	const response = await launchClient.api.cases.import.$post(undefined, {
		headers: { "Content-Type": "application/json" },
		init: {
			body: JSON.stringify({
				bundle: bundleDocument(request.bundleText),
				id: request.id.trim(),
				targetPath: request.targetPath.trim(),
				title: request.title,
			}),
		},
	});
	if (response.status !== HTTP_STATUS.created) {
		throw new BundleRefusedError(await refusalReason(response));
	}
	const imported = await response.json();

	return imported.path;
}

export { bundleUrl, importBundle, previewBundle };
export type { BundlePreview, ImportDraft, ImportRequest };
