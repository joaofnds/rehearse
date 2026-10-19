import type { ESTree } from "@oxlint/plugins";

import { referencedAliasName } from "./local-type-aliases.ts";
import type { LocalAliasResolution } from "./local-type-aliases.ts";
import type { Syntax } from "./syntax.ts";

function resolvesUnknownReference(
	type: Syntax<ESTree.TSType>,
	resolution: LocalAliasResolution,
): boolean {
	const name = referencedAliasName(type);
	if (name === null || resolution.visited.has(name)) {
		return false;
	}
	const alias = resolution.aliases.get(name);
	if (
		alias === undefined ||
		(alias.typeParameters !== null && alias.typeParameters !== undefined)
	) {
		return false;
	}
	return resolvesToUnknown(alias.typeAnnotation, {
		...resolution,
		visited: new Set([...resolution.visited, name]),
	});
}

function resolvesToUnknown(
	type: Syntax<ESTree.TSType>,
	resolution: LocalAliasResolution,
): boolean {
	if (type.type === "TSUnknownKeyword") {
		return true;
	}
	if (type.type === "TSParenthesizedType") {
		return resolvesToUnknown(type.typeAnnotation, resolution);
	}
	return resolvesUnknownReference(type, resolution);
}

export { resolvesToUnknown as default };
