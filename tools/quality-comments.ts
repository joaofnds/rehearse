import { extname } from "node:path";

import type { Nodes as MarkdownNode } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { parse } from "oxc-parser";
import { parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import { parse as parseCss } from "postcss";

import type { Immutable } from "#benchmark/contracts";

import {
	jsonComments,
	tomlComments,
	yamlComments,
} from "./quality-data-comments";
import type { SourceComment } from "./quality-source-comment";

const EMPTY_COLLECTION_LENGTH = 0;

async function scriptComments(
	path: string,
	source: string,
): Promise<readonly SourceComment[]> {
	const parsed = await parse(path, source);
	const [error] = parsed.errors;
	if (error !== undefined) {
		throw new Error(`Cannot inspect comments in ${path}: ${error.message}`);
	}
	return parsed.comments;
}

function cssComments(path: string, source: string): readonly SourceComment[] {
	const comments: SourceComment[] = [];
	parseCss(source, { from: path }).walkComments((comment) => {
		const start = comment.source?.start?.offset;
		if (start === undefined) {
			throw new Error(`Cannot locate CSS comment in ${path}`);
		}
		comments.push({ start, value: comment.text });
	});
	return comments;
}

interface EmbeddedLanguage {
	readonly tag: string;
	readonly type: string;
}

async function embeddedComments(
	{ tag, type }: EmbeddedLanguage,
	path: string,
	source: string,
): Promise<readonly SourceComment[]> {
	if (tag === "style") {
		return cssComments(path, source);
	}
	if (type === "application/json" || type.endsWith("+json")) {
		return jsonComments(path, source);
	}
	return await scriptComments(`${path}.js`, source);
}

function* htmlNodes(source: string): Generator<DefaultTreeAdapterTypes.Node> {
	const pending: DefaultTreeAdapterTypes.Node[] = [
		parseFragment(source, { sourceCodeLocationInfo: true }),
	];
	while (pending.length > EMPTY_COLLECTION_LENGTH) {
		const node = pending.pop();
		if (node === undefined) {
			break;
		}
		if ("content" in node) {
			pending.push(node.content);
		}
		if ("childNodes" in node) {
			pending.push(...node.childNodes);
		}
		yield node;
	}
}

async function htmlComments(
	path: string,
	source: string,
): Promise<readonly SourceComment[]> {
	const comments: SourceComment[] = [];
	await Array.fromAsync(htmlNodes(source), async (node) => {
		if (node.nodeName === "#comment" && "data" in node) {
			const start = node.sourceCodeLocation?.startOffset;
			if (start === undefined) {
				throw new Error(`Cannot locate HTML comment in ${path}`);
			}
			comments.push({ start, value: node.data });
		}
		if (
			"tagName" in node &&
			(node.tagName === "script" || node.tagName === "style")
		) {
			await Array.fromAsync(node.childNodes, async (child) => {
				if (child.nodeName !== "#text" || !("value" in child)) {
					return;
				}
				const start = child.sourceCodeLocation?.startOffset;
				if (start === undefined) {
					throw new Error(`Cannot locate embedded ${node.tagName} in ${path}`);
				}
				const type =
					node.attrs.find((attribute) => attribute.name === "type")?.value ??
					"";
				const nested = await embeddedComments(
					{ tag: node.tagName, type },
					path,
					child.value,
				);
				comments.push(
					...nested.map((comment) => ({
						start: start + comment.start,
						value: comment.value,
					})),
				);
			});
		}
	});
	return comments;
}

function* markdownNodes(
	root: Immutable<MarkdownNode>,
): Generator<Immutable<MarkdownNode>> {
	const pending: Immutable<MarkdownNode>[] = [root];
	while (pending.length > EMPTY_COLLECTION_LENGTH) {
		const node = pending.pop();
		if (node === undefined) {
			break;
		}
		if ("children" in node) {
			pending.push(...node.children);
		}
		yield node;
	}
}

async function markdownComments(
	path: string,
	source: string,
): Promise<readonly SourceComment[]> {
	const comments: SourceComment[] = [];
	await Array.fromAsync(markdownNodes(fromMarkdown(source)), async (node) => {
		if (node.type === "html") {
			const start = node.position?.start.offset;
			const end = node.position?.end.offset;
			if (start === undefined || end === undefined) {
				throw new Error(`Cannot locate Markdown HTML in ${path}`);
			}
			const nested = await htmlComments(path, source.slice(start, end));
			comments.push(
				...nested.map((comment) => ({
					start: start + comment.start,
					value: comment.value,
				})),
			);
		}
	});
	return comments;
}

type CommentReader = (
	path: string,
	source: string,
) => readonly SourceComment[] | Promise<readonly SourceComment[]>;

const commentReaders: ReadonlyMap<string, CommentReader> = new Map<
	string,
	CommentReader
>([
	[".css", cssComments],
	[".json", jsonComments],
	[".jsonc", jsonComments],
	[".toml", tomlComments],
	[".yaml", yamlComments],
	[".yml", yamlComments],
	[".html", htmlComments],
	[".md", markdownComments],
]);

/** Read comment tokens through each maintained language's own parser. */
async function qualityComments(
	path: string,
	source: string,
): Promise<readonly SourceComment[]> {
	const extension = extname(path);
	const reader = /^\.[cm]?[jt]sx?$/u.test(extension)
		? scriptComments
		: commentReaders.get(extension);
	if (reader === undefined) {
		throw new Error(
			`Quality policy cannot inspect ${path}: add a native comment parser for ${extension} before adding this maintained file`,
		);
	}
	return await reader(path, source);
}

export { qualityComments as default };
export type { SourceComment } from "./quality-source-comment";
