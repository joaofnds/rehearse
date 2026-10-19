import type { ESTree } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";

type RuntimeExport = {
	readonly start: number;
	readonly end: number;
} & (
	| { readonly kind: "named"; readonly name: string }
	| { readonly kind: "wildcard" }
);

function unhandledBinding(pattern: never): never {
	throw new Error(`Unhandled binding pattern: ${String(pattern)}`);
}

function bindingNames(
	pattern: Syntax<ESTree.BindingPattern>,
): readonly string[] {
	switch (pattern.type) {
		case "Identifier": {
			return [pattern.name];
		}
		case "AssignmentPattern": {
			return bindingNames(pattern.left);
		}
		case "ObjectPattern": {
			return pattern.properties.flatMap((property) =>
				bindingNames(
					property.type === "RestElement" ? property.argument : property.value,
				),
			);
		}
		case "ArrayPattern": {
			return pattern.elements.flatMap((element) =>
				element === null
					? []
					: bindingNames(
							element.type === "RestElement" ? element.argument : element,
						),
			);
		}
		default: {
			return unhandledBinding(pattern);
		}
	}
}

function declarationNames(
	declaration: Syntax<ESTree.Declaration>,
): readonly string[] {
	if (declaration.type === "VariableDeclaration") {
		return declaration.declarations.flatMap(({ id }) => bindingNames(id));
	}

	if (
		declaration.type === "TSTypeAliasDeclaration" ||
		declaration.type === "TSInterfaceDeclaration"
	) {
		return [];
	}

	return declaration.id?.type === "Identifier" ? [declaration.id.name] : [];
}

function exportedName(name: Syntax<ESTree.ModuleExportName>): string {
	return name.type === "Literal" ? name.value : name.name;
}

function namedRuntimeExports(
	node: Syntax<ESTree.ExportNamedDeclaration>,
): readonly RuntimeExport[] {
	if (node.exportKind === "type") {
		return [];
	}

	if (node.declaration !== null) {
		return declarationNames(node.declaration).map((name): RuntimeExport => ({
			end: node.end,
			kind: "named",
			name,
			start: node.start,
		}));
	}

	return node.specifiers
		.filter((specifier) => specifier.exportKind !== "type")
		.map((specifier): RuntimeExport => ({
			end: specifier.end,
			kind: "named",
			name: exportedName(specifier.exported),
			start: specifier.start,
		}));
}

function runtimeExports(
	node: Syntax<ESTree.Statement>,
): readonly RuntimeExport[] {
	if (node.type === "ExportNamedDeclaration") {
		return namedRuntimeExports(node);
	}

	if (node.type === "ExportDefaultDeclaration") {
		return node.declaration.type === "TSInterfaceDeclaration"
			? []
			: [{ end: node.end, kind: "named", name: "default", start: node.start }];
	}

	if (node.type === "ExportAllDeclaration") {
		if (node.exportKind === "type") {
			return [];
		}

		return node.exported === null
			? [{ end: node.end, kind: "wildcard", start: node.start }]
			: [
					{
						end: node.end,
						kind: "named",
						name: exportedName(node.exported),
						start: node.start,
					},
				];
	}

	return [];
}

export { runtimeExports as default };
