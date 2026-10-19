import type { ESTree } from "@oxlint/plugins";

import { referencedAliasName } from "./local-type-aliases.ts";
import type { TypeAliasScope } from "./local-type-aliases.ts";
import type { Syntax } from "./syntax.ts";

function resolvesObjectAlias(
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
	return (
		alias !== undefined &&
		resolvesToObject(alias.typeAnnotation, {
			...scope,
			visited: new Set([...scope.visited, name]),
		})
	);
}

function resolvesToObject(
	type: Syntax<ESTree.TSType>,
	scope: TypeAliasScope,
): boolean {
	if (type.type === "TSObjectKeyword") {
		return true;
	}
	if (type.type === "TSParenthesizedType") {
		return resolvesToObject(type.typeAnnotation, scope);
	}
	if (type.type === "TSUnionType") {
		return type.types.some((member) => resolvesToObject(member, scope));
	}
	return resolvesObjectAlias(type, scope);
}

export { resolvesToObject as default };
