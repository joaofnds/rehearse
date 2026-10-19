import type { ESTree } from "@oxlint/plugins";

import {
	isUnappliedReferenceTo,
	resolveAliasReference,
	typeReferenceName,
	unwrapTransparentType,
} from "./dictionary-resolution.ts";
import type { DictionaryResolution } from "./dictionary-resolution.ts";
import type { Syntax } from "./syntax.ts";
import { isTransparentWrapper } from "./type-environment.ts";
import type { TypeEnvironment } from "./type-environment.ts";

const EMPTY_COLLECTION_LENGTH = 0;
const SINGLE_DECLARATION_COUNT = 1;

interface UnsafeDictionary {
	readonly kind: "unsafe-dictionary";
	readonly unsafeValue: "any" | "empty-object" | "object" | "union" | "unknown";
}

function isNeverType(type: Syntax<ESTree.TSType>): boolean {
	return unwrapTransparentType(type).type === "TSNeverKeyword";
}

function isEffectivelyEmptyMember(member: Syntax<ESTree.TSSignature>): boolean {
	return (
		member.type === "TSPropertySignature" &&
		member.optional &&
		member.typeAnnotation !== null &&
		member.typeAnnotation !== undefined &&
		isNeverType(member.typeAnnotation.typeAnnotation)
	);
}

function isEffectivelyEmptyTypeLiteral(
	type: Syntax<ESTree.TSTypeLiteral>,
): boolean {
	return (
		type.members.length === EMPTY_COLLECTION_LENGTH ||
		type.members.every(isEffectivelyEmptyMember)
	);
}

function isEffectivelyEmptyInterface(
	declarations: readonly Syntax<ESTree.TSInterfaceDeclaration>[],
): boolean {
	if (declarations.length !== SINGLE_DECLARATION_COUNT) {
		return false;
	}
	const [type] = declarations;
	return (
		type?.extends.length === EMPTY_COLLECTION_LENGTH &&
		(type.body.body.length === EMPTY_COLLECTION_LENGTH ||
			type.body.body.every(isEffectivelyEmptyMember))
	);
}

function unsafePrimitiveValue(
	unwrapped: Syntax<ESTree.TSType>,
): UnsafeDictionary["unsafeValue"] | null {
	if (unwrapped.type === "TSUnknownKeyword") {
		return "unknown";
	}
	if (unwrapped.type === "TSAnyKeyword") {
		return "any";
	}
	if (unwrapped.type === "TSObjectKeyword") {
		return "object";
	}
	if (
		unwrapped.type === "TSTypeLiteral" &&
		isEffectivelyEmptyTypeLiteral(unwrapped)
	) {
		return "empty-object";
	}
	return null;
}

function unsafeIntersectionValue(
	type: Syntax<ESTree.TSIntersectionType>,
	resolution: DictionaryResolution,
): UnsafeDictionary["unsafeValue"] | null {
	const unsafeMembers = type.types.map((member) =>
		unsafeDirectValue(member, resolution),
	);
	if (unsafeMembers.includes("any")) {
		return "any";
	}
	const [firstUnsafeValue] = unsafeMembers;
	return unsafeMembers.length > EMPTY_COLLECTION_LENGTH &&
		unsafeMembers.every((member) => member !== null)
		? (firstUnsafeValue ?? null)
		: null;
}

function unsafeDirectValue(
	type: Syntax<ESTree.TSType>,
	resolution: DictionaryResolution,
): UnsafeDictionary["unsafeValue"] | null {
	const unwrapped = unwrapTransparentType(type);
	const primitive = unsafePrimitiveValue(unwrapped);
	if (primitive !== null) {
		return primitive;
	}
	if (unwrapped.type === "TSUnionType") {
		return unwrapped.types.some(
			(member) => unsafeDirectValue(member, resolution) !== null,
		)
			? "union"
			: null;
	}
	if (unwrapped.type === "TSIntersectionType") {
		return unsafeIntersectionValue(unwrapped, resolution);
	}
	return unwrapped.type === "TSTypeReference"
		? unsafeReferenceValue(unwrapped, resolution)
		: null;
}

function unsafeReferenceValue(
	unwrapped: Syntax<ESTree.TSTypeReference>,
	resolution: DictionaryResolution,
): UnsafeDictionary["unsafeValue"] | null {
	const name = typeReferenceName(unwrapped);
	if (name === null) {
		return null;
	}
	if (isTransparentWrapper(name, resolution.environment)) {
		const [wrapped] =
			unwrapped.typeArguments === null ? [] : unwrapped.typeArguments.params;
		return wrapped === undefined
			? null
			: unsafeDirectValue(wrapped, resolution);
	}
	return unsafeBoundReferenceValue(name, unwrapped, resolution);
}

function unsafeBoundReferenceValue(
	name: string,
	type: Syntax<ESTree.TSTypeReference>,
	resolution: DictionaryResolution,
): UnsafeDictionary["unsafeValue"] | null {
	const substitution = resolution.substitutions.get(name);
	if (substitution !== undefined) {
		return isUnappliedReferenceTo(substitution, name)
			? null
			: unsafeDirectValue(substitution, resolution);
	}
	const interfaceDeclarations = resolution.environment.interfaces.get(name);
	if (interfaceDeclarations !== undefined) {
		return isEffectivelyEmptyInterface(interfaceDeclarations)
			? "empty-object"
			: null;
	}
	const alias = resolveAliasReference(name, type, resolution);
	return alias === null
		? null
		: unsafeDirectValue(alias.type, alias.resolution);
}

function classifyUnsafeDictionaryValue(
	valueType: Syntax<ESTree.TSType>,
	environment: TypeEnvironment,
): UnsafeDictionary | null {
	const unsafeValue = unsafeDirectValue(valueType, {
		environment,
		resolvingAliases: new Set(),
		substitutions: new Map(),
	});
	return unsafeValue === null
		? null
		: { kind: "unsafe-dictionary", unsafeValue };
}

export { classifyUnsafeDictionaryValue, unsafeDirectValue };
export type { UnsafeDictionary };
