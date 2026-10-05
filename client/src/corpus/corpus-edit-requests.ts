import type { InferResponseType } from "hono/client";
import { z } from "zod";
import { apiClient, launchClient } from "#client/api-client";
import { CORPUS_VERSION_HEADER } from "#server/corpus-version-header";

export type CorpusEditReview = InferResponseType<
	typeof launchClient.api.corpus.edits.review.$post,
	200
>;

export type AppliedCorpusEdit = InferResponseType<
	typeof launchClient.api.corpus.edits.apply.$post,
	200
>;

/** The server refused the edit, and its message says why. */
export class CorpusEditRefusedError extends Error {
	public override name = "CorpusEditRefusedError";
}

const refusalBodySchema = z.object({ error: z.string() });

/** The `{ error }` a refusal declares, or nothing for any other body. */
function declaredError(text: string): string | undefined {
	try {
		const body = refusalBodySchema.safeParse(JSON.parse(text));

		return body.success ? body.data.error : undefined;
	} catch {
		return undefined;
	}
}

/**
 * A refusal the edit routes declare arrives as `{ error }`. Anything else,
 * the request guard's plain-text 403 included, is shown as the server sent it.
 */
async function refusal(
	response: Readonly<{ text: () => Promise<string> }>,
): Promise<CorpusEditRefusedError> {
	const text = await response.text();
	return new CorpusEditRefusedError(declaredError(text) ?? text);
}

/** A file's text and the corpus version it was read at, which an edit starts from. */
export interface OpenedCorpusFile {
	readonly text: string;
	readonly version: string;
}

/**
 * Bytes that are not UTF-8 refuse, since decoding would replace them and an
 * apply would write the replacements. A byte order mark is kept in the text,
 * so an apply writes it back.
 */
function decodedText(path: string, bytes: ArrayBuffer): string {
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			bytes,
		);
	} catch {
		throw new CorpusEditRefusedError(
			`${path} is not UTF-8 text, and saving it as text would rewrite its bytes`,
		);
	}
}

/** A carriage return refuses, since the text box turns every line ending into a bare newline. */
function editableText(path: string, bytes: ArrayBuffer): string {
	const text = decodedText(path, bytes);
	if (text.includes("\r")) {
		throw new CorpusEditRefusedError(
			`${path} has carriage returns, which the text box would turn into bare newlines when saved`,
		);
	}

	return text;
}

export async function fetchCorpusFile(path: string): Promise<OpenedCorpusFile> {
	const response = await apiClient.api.corpus.file.$get({ query: { path } });
	if (!response.ok) {
		throw await refusal(response);
	}
	const version = response.headers.get(CORPUS_VERSION_HEADER);
	if (version === null) {
		throw new CorpusEditRefusedError(
			`The server sent ${path} without the corpus version it was read at`,
		);
	}

	return {
		text: editableText(path, await response.arrayBuffer()),
		version,
	};
}

/** Reviews the edit against the version its file was opened at. */
export async function reviewCorpusEdit(edit: {
	readonly path: string;
	readonly text: string;
	readonly startsFrom: string;
}): Promise<CorpusEditReview> {
	const response = await launchClient.api.corpus.edits.review.$post({
		json: edit,
	});
	if (response.status !== 200) {
		throw await refusal(response);
	}

	return response.json();
}

export async function applyCorpusEdit(edit: {
	readonly path: string;
	readonly text: string;
	readonly startsFrom: string;
}): Promise<AppliedCorpusEdit> {
	const response = await launchClient.api.corpus.edits.apply.$post({
		json: edit,
	});
	if (response.status !== 200) {
		throw await refusal(response);
	}

	return response.json();
}
