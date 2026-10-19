import type { ESTree } from "@oxlint/plugins";

import {
	typeReferenceName,
	typesHaveSameSyntax,
	unwrapTypeParentheses,
} from "./assertion-syntax.ts";
import type { Syntax } from "./syntax.ts";

const RECORD_TYPE_ARGUMENT_COUNT = 2;
const SINGLE_INDEX_SIGNATURE_MEMBER_COUNT = 1;
const SINGLE_INDEX_SIGNATURE_PARAMETER_COUNT = 1;
const EMPTY_TYPE_MEMBER_COUNT = 0;

type BroadTypeKind = "top" | "object" | "record";

interface KnownValueEvidence {
	readonly type: Syntax<ESTree.TSType> | null;
}

function isUnknownOrAnyType(type: Syntax<ESTree.TSType>): boolean {
	const unwrapped = unwrapTypeParentheses(type);
	return (
		unwrapped.type === "TSUnknownKeyword" || unwrapped.type === "TSAnyKeyword"
	);
}

function isBroadRecordKeyType(type: Syntax<ESTree.TSType>): boolean {
	const unwrapped = unwrapTypeParentheses(type);
	if (
		unwrapped.type === "TSStringKeyword" ||
		unwrapped.type === "TSNumberKeyword" ||
		unwrapped.type === "TSSymbolKeyword"
	) {
		return true;
	}
	if (unwrapped.type === "TSUnionType") {
		return unwrapped.types.every(isBroadRecordKeyType);
	}
	return (
		unwrapped.type === "TSTypeReference" &&
		typeReferenceName(unwrapped) === "PropertyKey"
	);
}

function isBroadRecordType(type: Syntax<ESTree.TSType>): boolean {
	const unwrapped = unwrapTypeParentheses(type);

	if (unwrapped.type === "TSTypeReference") {
		return isBroadRecordReference(unwrapped);
	}

	if (
		unwrapped.type !== "TSTypeLiteral" ||
		unwrapped.members.length !== SINGLE_INDEX_SIGNATURE_MEMBER_COUNT
	) {
		return false;
	}
	return isBroadIndexSignature(unwrapped);
}

function isBroadRecordReference(type: Syntax<ESTree.TSTypeReference>): boolean {
	if (typeReferenceName(type) === "Readonly") {
		const [inner] = type.typeArguments?.params ?? [];
		return inner !== undefined && isBroadRecordType(inner);
	}
	if (typeReferenceName(type) !== "Record") {
		return false;
	}
	const parameters = type.typeArguments?.params ?? [];
	const [keyType, valueType] = parameters;
	return (
		parameters.length === RECORD_TYPE_ARGUMENT_COUNT &&
		keyType !== undefined &&
		valueType !== undefined &&
		isBroadRecordKeyType(keyType) &&
		isUnknownOrAnyType(valueType)
	);
}

function isBroadIndexSignature(type: Syntax<ESTree.TSTypeLiteral>): boolean {
	const [member] = type.members;
	const [parameter] =
		member?.type === "TSIndexSignature" ? member.parameters : [];
	return (
		member?.type === "TSIndexSignature" &&
		member.parameters.length === SINGLE_INDEX_SIGNATURE_PARAMETER_COUNT &&
		parameter !== undefined &&
		isBroadRecordKeyType(parameter.typeAnnotation.typeAnnotation) &&
		isUnknownOrAnyType(member.typeAnnotation.typeAnnotation)
	);
}

function broadTypeKind(type: Syntax<ESTree.TSType>): BroadTypeKind | null {
	const unwrapped = unwrapTypeParentheses(type);
	if (
		unwrapped.type === "TSUnknownKeyword" ||
		unwrapped.type === "TSAnyKeyword"
	) {
		return "top";
	}
	if (unwrapped.type === "TSObjectKeyword") {
		return "object";
	}
	return isBroadRecordType(unwrapped) ? "record" : null;
}

const objectTypeKinds: ReadonlySet<string> = new Set([
	"TSArrayType",
	"TSConstructorType",
	"TSFunctionType",
	"TSMappedType",
	"TSObjectKeyword",
	"TSTupleType",
]);

function isDefinitelyObjectType(type: Syntax<ESTree.TSType>): boolean {
	const unwrapped = unwrapTypeParentheses(type);
	if (objectTypeKinds.has(unwrapped.type)) {
		return true;
	}
	if (unwrapped.type === "TSTypeLiteral") {
		return unwrapped.members.length > EMPTY_TYPE_MEMBER_COUNT;
	}
	if (unwrapped.type === "TSIntersectionType") {
		return unwrapped.types.every(isDefinitelyObjectType);
	}
	return (
		unwrapped.type === "TSTypeOperator" &&
		unwrapped.operator === "readonly" &&
		isDefinitelyObjectType(unwrapped.typeAnnotation)
	);
}

function isDefinitelyNarrowerRecordType(type: Syntax<ESTree.TSType>): boolean {
	const unwrapped = unwrapTypeParentheses(type);
	if (unwrapped.type === "TSTypeLiteral") {
		return unwrapped.members.some(
			(member) => member.type !== "TSIndexSignature",
		);
	}

	return unwrapped.type === "TSTypeReference"
		? isNarrowerRecordReference(unwrapped)
		: false;
}

function isNarrowerRecordReference(
	type: Syntax<ESTree.TSTypeReference>,
): boolean {
	if (typeReferenceName(type) === "Readonly") {
		const [inner] = type.typeArguments?.params ?? [];
		return inner !== undefined && isDefinitelyNarrowerRecordType(inner);
	}
	if (typeReferenceName(type) !== "Record") {
		return false;
	}

	const parameters = type.typeArguments?.params ?? [];
	const [, valueType] = parameters;
	return (
		parameters.length === RECORD_TYPE_ARGUMENT_COUNT &&
		valueType !== undefined &&
		!isUnknownOrAnyType(valueType)
	);
}

interface AssertionSource {
	readonly sourceText: string;
	readonly broadKind: BroadTypeKind;
}

function assertionIsNarrower(
	{ sourceText, broadKind }: AssertionSource,
	evidence: KnownValueEvidence,
	assertedType: Syntax<ESTree.TSType>,
): boolean {
	if (broadTypeKind(assertedType) !== null) {
		return false;
	}
	if (broadKind === "top") {
		return true;
	}
	if (typesHaveSameSyntax(sourceText, evidence.type, assertedType)) {
		return true;
	}
	if (broadKind === "object") {
		return isDefinitelyObjectType(assertedType);
	}
	return isDefinitelyNarrowerRecordType(assertedType);
}

export { assertionIsNarrower, broadTypeKind };
export type { BroadTypeKind, KnownValueEvidence };
