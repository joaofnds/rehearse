import type { ESTree } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";
import type { TypeEnvironment } from "./type-environment.ts";

const EMPTY_TYPE_ARGUMENT_COUNT = 0;

type TypeAliasEnvironment = ReadonlyMap<string, Syntax<ESTree.TSType>>;

interface DictionaryResolution {
	readonly environment: TypeEnvironment;
	readonly substitutions: TypeAliasEnvironment;
	readonly resolvingAliases: ReadonlySet<string>;
}

function typeReferenceName(
	type: Syntax<ESTree.TSTypeReference>,
): string | null {
	return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function unwrapTransparentType(
	type: Syntax<ESTree.TSType>,
): Syntax<ESTree.TSType> {
	let current = type;
	while (
		current.type === "TSParenthesizedType" ||
		(current.type === "TSTypeOperator" && current.operator === "readonly")
	) {
		current = current.typeAnnotation;
	}
	return current;
}

function isUnappliedReferenceTo(
	type: Syntax<ESTree.TSType>,
	name: string,
): boolean {
	const unwrapped = unwrapTransparentType(type);
	return (
		unwrapped.type === "TSTypeReference" &&
		typeReferenceName(unwrapped) === name &&
		(unwrapped.typeArguments === null ||
			unwrapped.typeArguments === undefined ||
			unwrapped.typeArguments.params.length === EMPTY_TYPE_ARGUMENT_COUNT)
	);
}

function resolvedSubstitutionArgument(
	type: Syntax<ESTree.TSType>,
	base: TypeAliasEnvironment,
	resolving: ReadonlySet<string> = new Set(),
): Syntax<ESTree.TSType> {
	const unwrapped = unwrapTransparentType(type);
	const name =
		unwrapped.type === "TSTypeReference" ? typeReferenceName(unwrapped) : null;
	if (name === null || resolving.has(name)) {
		return type;
	}
	const substitution = base.get(name);
	return substitution === undefined
		? type
		: resolvedSubstitutionArgument(
				substitution,
				base,
				new Set([...resolving, name]),
			);
}

function aliasSubstitution(
	alias: Syntax<ESTree.TSTypeAliasDeclaration>,
	type: Syntax<ESTree.TSTypeReference>,
	base: TypeAliasEnvironment,
): TypeAliasEnvironment | null {
	const parameters = alias.typeParameters?.params ?? [];
	const typeArguments = type.typeArguments?.params ?? [];
	const next = new Map(base);
	for (const [index, parameter] of parameters.entries()) {
		const argument = typeArguments[index] ?? parameter.default;
		if (argument === null || argument === undefined) {
			return null;
		}
		next.set(parameter.name.name, resolvedSubstitutionArgument(argument, next));
	}
	return next;
}

interface ResolvedAlias {
	readonly resolution: DictionaryResolution;
	readonly type: Syntax<ESTree.TSType>;
}

function resolveAliasReference(
	name: string,
	type: Syntax<ESTree.TSTypeReference>,
	{ environment, substitutions, resolvingAliases }: DictionaryResolution,
): ResolvedAlias | null {
	const alias = environment.aliases.get(name);
	if (alias === undefined || resolvingAliases.has(name)) {
		return null;
	}
	const nextSubstitutions = aliasSubstitution(alias, type, substitutions);
	if (nextSubstitutions === null) {
		return null;
	}
	return {
		resolution: {
			environment,
			resolvingAliases: new Set([...resolvingAliases, name]),
			substitutions: nextSubstitutions,
		},
		type: alias.typeAnnotation,
	};
}

export {
	aliasSubstitution,
	isUnappliedReferenceTo,
	resolveAliasReference,
	typeReferenceName,
	unwrapTransparentType,
};
export type { DictionaryResolution, TypeAliasEnvironment };
