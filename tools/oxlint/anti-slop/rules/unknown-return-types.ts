import type { ESTree } from "@oxlint/plugins";

import { referencedAliasName } from "./local-type-aliases.ts";
import type { TypeAliasScope } from "./local-type-aliases.ts";
import type { Syntax } from "./syntax.ts";

function resolvesUnknownAlias(
	type: Syntax<ESTree.TSType>,
	scope: TypeAliasScope,
): boolean {
	const name = referencedAliasName(type);
	if (
		name === null ||
		scope.visited.has(name) ||
		scope.shadowedAliases.has(name)
	) {
		return false;
	}
	const alias = scope.aliases.get(name);
	if (
		alias === undefined ||
		(alias.typeParameters !== null && alias.typeParameters !== undefined)
	) {
		return false;
	}
	return resolvesToUnknown(alias.typeAnnotation, {
		...scope,
		visited: new Set([...scope.visited, name]),
	});
}

function resolvesToUnknown(
	type: Syntax<ESTree.TSType>,
	scope: TypeAliasScope,
): boolean {
	if (type.type === "TSUnknownKeyword") {
		return true;
	}
	if (type.type === "TSParenthesizedType") {
		return resolvesToUnknown(type.typeAnnotation, scope);
	}
	if (type.type === "TSUnionType") {
		return type.types.some((member) => resolvesToUnknown(member, scope));
	}
	if (
		type.type === "TSTypeReference" &&
		type.typeName.type === "Identifier" &&
		(type.typeName.name === "Promise" || type.typeName.name === "PromiseLike")
	) {
		const [value] = type.typeArguments?.params ?? [];
		return value !== undefined && resolvesToUnknown(value, scope);
	}
	return resolvesUnknownAlias(type, scope);
}

export { resolvesToUnknown as default };
