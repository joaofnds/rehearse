import type { ESTree } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";

const EMPTY_TYPE_ARGUMENT_COUNT = 0;

interface LocalAliasResolution {
	readonly aliases: ReadonlyMap<string, Syntax<ESTree.TSTypeAliasDeclaration>>;
	readonly visited: ReadonlySet<string>;
}

interface TypeAliasScope extends LocalAliasResolution {
	readonly shadowedAliases: ReadonlySet<string>;
}

function* localTypeAliases(
	program: Syntax<ESTree.Program>,
): Generator<Syntax<ESTree.TSTypeAliasDeclaration>> {
	for (const statement of program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (declaration?.type === "TSTypeAliasDeclaration") {
			yield declaration;
		}
	}
}

function referencedAliasName(type: Syntax<ESTree.TSType>): string | null {
	if (type.type === "TSParenthesizedType") {
		return referencedAliasName(type.typeAnnotation);
	}
	if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") {
		return null;
	}
	return type.typeArguments === null ||
		type.typeArguments === undefined ||
		type.typeArguments.params.length === EMPTY_TYPE_ARGUMENT_COUNT
		? type.typeName.name
		: null;
}

export { localTypeAliases, referencedAliasName };
export type { LocalAliasResolution, TypeAliasScope };
