import type { ESTree } from "@oxlint/plugins";

import {
	isUnappliedReferenceTo,
	resolveAliasReference,
	typeReferenceName,
	unwrapTransparentType,
} from "./dictionary-resolution.ts";
import type {
	DictionaryResolution,
	TypeAliasEnvironment,
} from "./dictionary-resolution.ts";
import type { Syntax } from "./syntax.ts";
import { isBuiltIn, isTransparentWrapper } from "./type-environment.ts";
import type { TypeEnvironment } from "./type-environment.ts";
import { unsafeDirectValue } from "./unsafe-dictionary-values.ts";
import type { UnsafeDictionary } from "./unsafe-dictionary-values.ts";

const EMPTY_COLLECTION_LENGTH = 0;

interface ResolvedType {
	readonly type: Syntax<ESTree.TSType>;
	readonly substitutions: TypeAliasEnvironment;
}

function dictionaryValueTypes(
	type: Syntax<ESTree.TSType>,
	{ environment, substitutions, resolvingAliases }: DictionaryResolution,
): readonly ResolvedType[] {
	const unwrapped = unwrapTransparentType(type);

	if (unwrapped.type === "TSTypeLiteral") {
		return unwrapped.members.flatMap((member): readonly ResolvedType[] =>
			member.type === "TSIndexSignature" && member.typeAnnotation !== null
				? [{ substitutions, type: member.typeAnnotation.typeAnnotation }]
				: [],
		);
	}

	if (unwrapped.type === "TSMappedType") {
		return unwrapped.typeAnnotation === null
			? []
			: [{ substitutions, type: unwrapped.typeAnnotation }];
	}

	if (unwrapped.type !== "TSTypeReference") {
		return [];
	}
	return referenceDictionaryValueTypes(unwrapped, {
		environment,
		resolvingAliases,
		substitutions,
	});
}

function referenceDictionaryValueTypes(
	unwrapped: Syntax<ESTree.TSTypeReference>,
	resolution: DictionaryResolution,
): readonly ResolvedType[] {
	const name = typeReferenceName(unwrapped);
	if (name === null) {
		return [];
	}

	const substitution = resolution.substitutions.get(name);
	if (substitution !== undefined) {
		return isUnappliedReferenceTo(substitution, name)
			? []
			: dictionaryValueTypes(substitution, resolution);
	}
	return builtInDictionaryValueTypes(name, unwrapped, resolution);
}

function builtInDictionaryValueTypes(
	name: string,
	unwrapped: Syntax<ESTree.TSTypeReference>,
	resolution: DictionaryResolution,
): readonly ResolvedType[] {
	const { environment, substitutions } = resolution;
	if (
		isTransparentWrapper(name, environment) ||
		((name === "Pick" || name === "Omit") && isBuiltIn(name, environment))
	) {
		const [wrapped] =
			unwrapped.typeArguments === null ? [] : unwrapped.typeArguments.params;
		return wrapped === undefined
			? []
			: dictionaryValueTypes(wrapped, resolution);
	}

	if (name === "Record" && isBuiltIn(name, environment)) {
		const [, value = null] =
			unwrapped.typeArguments === null ? [] : unwrapped.typeArguments.params;
		return value === null ? [] : [{ substitutions, type: value }];
	}

	return aliasDictionaryValueTypes(name, unwrapped, resolution);
}

function aliasDictionaryValueTypes(
	name: string,
	type: Syntax<ESTree.TSTypeReference>,
	resolution: DictionaryResolution,
): readonly ResolvedType[] {
	const alias = resolveAliasReference(name, type, resolution);
	return alias === null
		? []
		: dictionaryValueTypes(alias.type, alias.resolution);
}

function classifyUnsafeDictionary(
	type: Syntax<ESTree.TSType>,
	environment: TypeEnvironment,
): UnsafeDictionary | null {
	for (const valueType of dictionaryValueTypes(type, {
		environment,
		resolvingAliases: new Set(),
		substitutions: new Map(),
	})) {
		const unsafeValue = unsafeDirectValue(valueType.type, {
			environment,
			resolvingAliases: new Set(),
			substitutions: valueType.substitutions,
		});
		if (unsafeValue !== null) {
			return { kind: "unsafe-dictionary", unsafeValue };
		}
	}
	return null;
}

function resolvesToDictionary(
	type: Syntax<ESTree.TSType>,
	{ environment, substitutions, resolvingAliases }: DictionaryResolution,
): boolean {
	return (
		dictionaryValueTypes(type, { environment, resolvingAliases, substitutions })
			.length > EMPTY_COLLECTION_LENGTH
	);
}

export { classifyUnsafeDictionary, resolvesToDictionary };
