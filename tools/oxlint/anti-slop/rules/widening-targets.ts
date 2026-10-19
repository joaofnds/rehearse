import type { ESTree } from "@oxlint/plugins";

import {
	aliasSubstitution,
	isUnappliedReferenceTo,
	resolveAliasReference,
	typeReferenceName,
	unwrapTransparentType,
} from "./dictionary-resolution.ts";
import type {
	DictionaryResolution,
	TypeAliasEnvironment,
} from "./dictionary-resolution.ts";
import { resolvesToDictionary } from "./dictionary-types.ts";
import type { Syntax } from "./syntax.ts";
import { isBuiltIn, isTransparentWrapper } from "./type-environment.ts";
import type { TypeEnvironment } from "./type-environment.ts";

const EMPTY_COLLECTION_LENGTH = 0;

type WideningTargetKind =
	| "anonymous object"
	| "generic container"
	| "object"
	| "open dictionary"
	| "unknown";

interface WideningTarget {
	readonly kind: WideningTargetKind;
}

function primitiveWideningTarget(
	type: Syntax<ESTree.TSType>,
): WideningTarget | null {
	if (type.type === "TSUnknownKeyword") {
		return { kind: "unknown" };
	}
	return type.type === "TSObjectKeyword" ? { kind: "object" } : null;
}

function literalWideningTarget(
	type: Syntax<ESTree.TSTypeLiteral>,
): WideningTarget | null {
	if (type.members.some((member) => member.type === "TSIndexSignature")) {
		return { kind: "open dictionary" };
	}
	return type.members.length > EMPTY_COLLECTION_LENGTH
		? { kind: "anonymous object" }
		: null;
}

function classifyWideningTarget(
	type: Syntax<ESTree.TSType>,
	environment: TypeEnvironment,
): WideningTarget | null {
	const unwrapped = unwrapTransparentType(type);
	const primitive = primitiveWideningTarget(unwrapped);
	if (primitive !== null) {
		return primitive;
	}
	if (unwrapped.type === "TSTypeLiteral") {
		return literalWideningTarget(unwrapped);
	}
	if (unwrapped.type === "TSMappedType") {
		return { kind: "open dictionary" };
	}
	return unwrapped.type === "TSTypeReference"
		? referenceWideningTarget(unwrapped, environment)
		: null;
}

function referenceWideningTarget(
	type: Syntax<ESTree.TSTypeReference>,
	environment: TypeEnvironment,
): WideningTarget | null {
	const name = typeReferenceName(type);
	if (name === null) {
		return null;
	}
	if (isTransparentWrapper(name, environment)) {
		const [wrapped] =
			type.typeArguments === null ? [] : type.typeArguments.params;
		return wrapped === undefined
			? null
			: classifyWideningTarget(wrapped, environment);
	}
	if (name === "Record" && isBuiltIn(name, environment)) {
		return { kind: "open dictionary" };
	}
	return aliasWideningTarget(name, type, environment);
}

function aliasWideningTarget(
	name: string,
	type: Syntax<ESTree.TSTypeReference>,
	environment: TypeEnvironment,
): WideningTarget | null {
	const alias = environment.aliases.get(name);
	if (alias === undefined) {
		return null;
	}
	const substitutions = aliasSubstitution(alias, type, new Map());
	if (substitutions === null) {
		return null;
	}
	const resolution = {
		environment,
		resolvingAliases: new Set([name]),
		substitutions,
	};
	return (alias.typeParameters?.params.length ?? EMPTY_COLLECTION_LENGTH) >
		EMPTY_COLLECTION_LENGTH
		? genericAliasWideningTarget(alias.typeAnnotation, resolution)
		: classifyAliasBroadTarget(alias.typeAnnotation, resolution);
}

function genericAliasWideningTarget(
	type: Syntax<ESTree.TSType>,
	resolution: DictionaryResolution,
): WideningTarget | null {
	return resolvesToDictionary(type, resolution)
		? { kind: "generic container" }
		: null;
}

function isBroadMappedKey(
	type: Syntax<ESTree.TSType>,
	environment: TypeEnvironment,
	substitutions: TypeAliasEnvironment,
): boolean {
	const unwrapped = unwrapTransparentType(type);
	if (
		unwrapped.type === "TSStringKeyword" ||
		unwrapped.type === "TSNumberKeyword" ||
		unwrapped.type === "TSSymbolKeyword"
	) {
		return true;
	}
	if (unwrapped.type === "TSUnionType") {
		return unwrapped.types.every((member) =>
			isBroadMappedKey(member, environment, substitutions),
		);
	}
	return unwrapped.type === "TSTypeReference"
		? isBroadMappedReference(unwrapped, environment, substitutions)
		: false;
}

function isBroadMappedReference(
	type: Syntax<ESTree.TSTypeReference>,
	environment: TypeEnvironment,
	substitutions: TypeAliasEnvironment,
): boolean {
	const name = typeReferenceName(type);
	if (name === null) {
		return false;
	}
	const substitution = substitutions.get(name);
	if (
		substitution !== undefined &&
		!isUnappliedReferenceTo(substitution, name)
	) {
		return isBroadMappedKey(substitution, environment, substitutions);
	}
	return name === "PropertyKey" && isBuiltIn(name, environment);
}

function classifyAliasBroadTarget(
	type: Syntax<ESTree.TSType>,
	resolution: DictionaryResolution,
): WideningTarget | null {
	const unwrapped = unwrapTransparentType(type);
	const primitive = primitiveWideningTarget(unwrapped);
	if (primitive !== null) {
		return primitive;
	}
	if (unwrapped.type === "TSTypeLiteral") {
		return aliasLiteralWideningTarget(unwrapped);
	}
	if (unwrapped.type === "TSMappedType") {
		return isBroadMappedKey(
			unwrapped.constraint,
			resolution.environment,
			resolution.substitutions,
		)
			? { kind: "open dictionary" }
			: null;
	}
	return unwrapped.type === "TSTypeReference"
		? aliasReferenceWideningTarget(unwrapped, resolution)
		: null;
}

function aliasLiteralWideningTarget(
	type: Syntax<ESTree.TSTypeLiteral>,
): WideningTarget | null {
	return type.members.some((member) => member.type === "TSIndexSignature")
		? { kind: "open dictionary" }
		: null;
}

function aliasReferenceWideningTarget(
	type: Syntax<ESTree.TSTypeReference>,
	resolution: DictionaryResolution,
): WideningTarget | null {
	const name = typeReferenceName(type);
	if (name === null) {
		return null;
	}
	const substitution = resolution.substitutions.get(name);
	if (substitution !== undefined) {
		return isUnappliedReferenceTo(substitution, name)
			? null
			: classifyAliasBroadTarget(substitution, resolution);
	}
	return builtInAliasWideningTarget(name, type, resolution);
}

function builtInAliasWideningTarget(
	name: string,
	type: Syntax<ESTree.TSTypeReference>,
	resolution: DictionaryResolution,
): WideningTarget | null {
	if (isTransparentWrapper(name, resolution.environment)) {
		const [wrapped] =
			type.typeArguments === null ? [] : type.typeArguments.params;
		return wrapped === undefined
			? null
			: classifyAliasBroadTarget(wrapped, resolution);
	}
	if (name === "Record" && isBuiltIn(name, resolution.environment)) {
		return { kind: "open dictionary" };
	}
	const alias = resolveAliasReference(name, type, resolution);
	return alias === null
		? null
		: classifyAliasBroadTarget(alias.type, alias.resolution);
}

export { classifyWideningTarget as default };
export type { WideningTarget, WideningTargetKind };
