import { visit } from "jsonc-parser";
import { parseForESLint } from "toml-eslint-parser";
import { Parser } from "yaml";
import type { CST } from "yaml";

import type { Immutable } from "#benchmark/contracts";

import type { SourceComment } from "./quality-source-comment";

const EMPTY_COLLECTION_LENGTH = 0;
const LINE_COMMENT_PREFIX_LENGTH = 2;
const BLOCK_COMMENT_DELIMITER_LENGTH = 2;
const HASH_COMMENT_PREFIX_LENGTH = 1;

function jsonComments(path: string, source: string): readonly SourceComment[] {
	const comments: SourceComment[] = [];
	visit(
		source,
		{
			onComment(start, length) {
				const token = source.slice(start, start + length);
				comments.push({
					start,
					value: token.startsWith("//")
						? token.slice(LINE_COMMENT_PREFIX_LENGTH)
						: token.slice(
								BLOCK_COMMENT_DELIMITER_LENGTH,
								-BLOCK_COMMENT_DELIMITER_LENGTH,
							),
				});
			},
			onError(error, offset) {
				throw new Error(
					`Cannot inspect JSON comments in ${path} at ${String(offset)}: parser error ${String(error)}`,
				);
			},
		},
		{ allowEmptyContent: true, allowTrailingComma: true },
	);
	return comments;
}

function tomlComments(_path: string, source: string): readonly SourceComment[] {
	return parseForESLint(source).ast.comments.map((comment) => {
		const [start] = comment.range;
		return { start, value: comment.value };
	});
}

function collectionItemTokens(
	item: Immutable<CST.CollectionItem>,
): readonly Immutable<CST.Token>[] {
	return [
		...item.start,
		...(item.sep ?? []),
		...(item.key === undefined || item.key === null ? [] : [item.key]),
		...(item.value === undefined ? [] : [item.value]),
	];
}

function startTokens(
	token: Immutable<CST.Token>,
): readonly Immutable<CST.Token>[] {
	if (!("start" in token)) {
		return [];
	}
	return token.type === "flow-collection" ? [token.start] : token.start;
}

function childTokens(
	token: Immutable<CST.Token>,
): readonly Immutable<CST.Token>[] {
	return [
		...startTokens(token),
		...("end" in token ? (token.end ?? []) : []),
		...("value" in token && token.value !== undefined ? [token.value] : []),
		...("props" in token ? token.props : []),
		...("items" in token ? token.items.flatMap(collectionItemTokens) : []),
	];
}

function* yamlTokens(source: string): Generator<Immutable<CST.Token>> {
	const pending: Immutable<CST.Token>[] = [...new Parser().parse(source)];
	while (pending.length > EMPTY_COLLECTION_LENGTH) {
		const token = pending.pop();
		if (token === undefined) {
			break;
		}
		pending.push(...childTokens(token));
		yield token;
	}
}

function yamlComments(_path: string, source: string): readonly SourceComment[] {
	const comments: SourceComment[] = [];
	for (const token of yamlTokens(source)) {
		if (token.type === "error") {
			throw new Error(`Cannot tokenize YAML comments: ${token.message}`);
		}
		if (token.type === "comment") {
			comments.push({
				start: token.offset,
				value: token.source.slice(HASH_COMMENT_PREFIX_LENGTH),
			});
		}
	}
	return comments;
}

export { jsonComments, tomlComments, yamlComments };
