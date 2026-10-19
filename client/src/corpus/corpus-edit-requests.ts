import type { UseQueryOptions } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { apiClient, launchClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import refusalReason from "#client/refusal-reason";
import CORPUS_VERSION_HEADER from "#server/corpus-version-header";

type CorpusEditReview = InferResponseType<
	typeof launchClient.api.corpus.edits.review.$post,
	typeof HTTP_STATUS.ok
>;

type AppliedCorpusEdit = InferResponseType<
	typeof launchClient.api.corpus.edits.apply.$post,
	typeof HTTP_STATUS.ok
>;

/** The server refused the edit, and its message says why. */
class CorpusEditRefusedError extends Error {
	public override name = "CorpusEditRefusedError";
}

async function refusal(
	response: Readonly<{ text: () => Promise<string> }>,
): Promise<CorpusEditRefusedError> {
	return new CorpusEditRefusedError(await refusalReason(response));
}

/** A file's text and the corpus version it was read at, which an edit starts from. */
interface OpenedCorpusFile {
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
			`${path} is not UTF-8 text. Decoding would replace its bytes, so text viewing and editing are refused`,
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

async function fetchCorpusBytes(
	path: string,
): Promise<{ readonly bytes: ArrayBuffer; readonly version: string }> {
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

	return { bytes: await response.arrayBuffer(), version };
}

async function fetchCorpusFile(path: string): Promise<OpenedCorpusFile> {
	const { bytes, version } = await fetchCorpusBytes(path);
	return { text: editableText(path, bytes), version };
}

async function fetchCorpusFileForReading(
	path: string,
): Promise<OpenedCorpusFile> {
	const { bytes, version } = await fetchCorpusBytes(path);
	return { text: decodedText(path, bytes), version };
}

/** Reviews the edit against the version its file was opened at. */
interface ReviewCorpusEditProps {
	readonly path: string;
	readonly text: string;
	readonly startsFrom: string;
}

async function reviewCorpusEdit(
	edit: ReviewCorpusEditProps,
): Promise<CorpusEditReview> {
	const response = await launchClient.api.corpus.edits.review.$post({
		json: edit,
	});
	if (response.status !== HTTP_STATUS.ok) {
		throw await refusal(response);
	}

	return await response.json();
}

interface ApplyCorpusEditProps {
	readonly path: string;
	readonly text: string;
	readonly startsFrom: string;
}

async function applyCorpusEdit(
	edit: ApplyCorpusEditProps,
): Promise<AppliedCorpusEdit> {
	const response = await launchClient.api.corpus.edits.apply.$post({
		json: edit,
	});
	if (response.status !== HTTP_STATUS.ok) {
		throw await refusal(response);
	}

	return await response.json();
}

function corpusEditingFile(
	root: string,
	path: string,
): UseQueryOptions<OpenedCorpusFile, Error, OpenedCorpusFile, string[]> {
	return queryOptions({
		gcTime: 0,
		queryFn: async () => await fetchCorpusFile(path),
		queryKey: ["corpus-file", root, path],
		refetchOnMount: "always",
	});
}

export {
	applyCorpusEdit,
	corpusEditingFile,
	CorpusEditRefusedError,
	fetchCorpusFile,
	fetchCorpusFileForReading,
	reviewCorpusEdit,
};
export type {
	AppliedCorpusEdit,
	ApplyCorpusEditProps,
	CorpusEditReview,
	OpenedCorpusFile,
	ReviewCorpusEditProps,
};
