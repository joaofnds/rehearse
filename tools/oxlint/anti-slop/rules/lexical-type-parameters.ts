import type { ESTree } from "@oxlint/plugins";
import { z } from "zod";

import type { Syntax } from "./syntax.ts";

type VisitorKeys = Readonly<Record<string, readonly string[]>>;

type NodeField<Node extends ESTree.Node> = Node extends ESTree.Node
	? Node[keyof Node]
	: never;
type ArrayElement<Value> = Value extends readonly (infer Element)[]
	? Element
	: never;
type NodeKey<Node extends ESTree.Node> = Node extends ESTree.Node
	? keyof Node
	: never;
type NativeField = NodeField<ESTree.Node>;
type SyntaxField = Syntax<NativeField | ArrayElement<NativeField>>;
type SyntaxArray = Extract<SyntaxField, readonly SyntaxField[]>;
type SyntaxFields = Readonly<
	Partial<Record<NodeKey<ESTree.Node>, SyntaxField>>
>;

const nodeTag = z.object({ type: z.string() });

function isNode(value: SyntaxField): value is Syntax<ESTree.Node> {
	return nodeTag.safeParse(value).success;
}

function isArrayField(value: SyntaxField): value is SyntaxArray {
	return Array.isArray(value);
}

function isNodeField(
	node: SyntaxFields,
	key: string,
): key is keyof SyntaxFields {
	return key in node;
}

function syntaxField(node: SyntaxFields, key: string): SyntaxField | undefined {
	return isNodeField(node, key) ? node[key] : undefined;
}

function collectInferTypeParameterNames(
	node: Syntax<ESTree.Node>,
	visitorKeys: VisitorKeys,
	names: Set<string>,
): void {
	if (node.type === "TSInferType") {
		names.add(node.typeParameter.name.name);
	}
	for (const key of visitorKeys[node.type] ?? []) {
		collectInferFromField(syntaxField(node, key), visitorKeys, names);
	}
}

function collectInferFromField(
	value: SyntaxField | undefined,
	visitorKeys: VisitorKeys,
	names: Set<string>,
): void {
	if (value === undefined) {
		return;
	}
	if (isNode(value)) {
		collectInferTypeParameterNames(value, visitorKeys, names);
	} else if (isArrayField(value)) {
		for (const child of value) {
			if (isNode(child)) {
				collectInferTypeParameterNames(child, visitorKeys, names);
			}
		}
	}
}

function collectEnclosingTypeParameters(
	current: Syntax<ESTree.Node>,
	descendant: Syntax<ESTree.Node>,
	names: Set<string>,
): void {
	if ("typeParameters" in current) {
		for (const parameter of current.typeParameters?.params ?? []) {
			names.add(parameter.name.name);
		}
	}
	if (
		current.type === "TSMappedType" &&
		(descendant === current.nameType || descendant === current.typeAnnotation)
	) {
		names.add(current.key.name);
	}
}

/** Collect type binders that are in scope at a node and can shadow module aliases. */
function lexicalTypeParameterNames(
	node: Syntax<ESTree.Node>,
	visitorKeys: VisitorKeys,
): ReadonlySet<string> {
	const names = new Set<string>();
	let descendant: Syntax<ESTree.Node> = node;
	let current: Syntax<ESTree.Node> | null = node;
	while (current !== null && current.type !== "Program") {
		collectEnclosingTypeParameters(current, descendant, names);
		if (
			current.type === "TSConditionalType" &&
			descendant === current.trueType
		) {
			collectInferTypeParameterNames(current.extendsType, visitorKeys, names);
		}
		descendant = current;
		current = current.parent;
	}
	return names;
}

export { lexicalTypeParameterNames as default };
