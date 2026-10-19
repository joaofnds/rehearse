import type { ESTree } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";

const BUILT_INS = new Set([
	"Record",
	"Readonly",
	"Partial",
	"Required",
	"Pick",
	"Omit",
	"PropertyKey",
	"NonNullable",
]);

const TRANSPARENT_WRAPPERS = new Set([
	"Readonly",
	"Partial",
	"Required",
	"NonNullable",
]);

interface TypeEnvironment {
	readonly aliases: ReadonlyMap<string, Syntax<ESTree.TSTypeAliasDeclaration>>;
	readonly interfaces: ReadonlyMap<
		string,
		readonly Syntax<ESTree.TSInterfaceDeclaration>[]
	>;
	readonly shadowedBuiltIns: ReadonlySet<string>;
}

function declaredStatement(
	statement: Syntax<ESTree.Statement>,
): Syntax<ESTree.Node> | null {
	return statement.type === "ExportNamedDeclaration" ||
		statement.type === "ExportDefaultDeclaration"
		? (statement.declaration ?? null)
		: statement;
}

function declarationName(
	declaration: Syntax<ESTree.Node> | null,
): string | null {
	if (declaration === null) {
		return null;
	}
	if (
		declaration.type === "TSTypeAliasDeclaration" ||
		declaration.type === "TSInterfaceDeclaration" ||
		declaration.type === "TSEnumDeclaration"
	) {
		return declaration.id.name;
	}
	if (
		declaration.type === "ClassDeclaration" ||
		declaration.type === "FunctionDeclaration"
	) {
		return declaration.id?.name ?? null;
	}
	return null;
}

function isBuiltIn(name: string, environment: TypeEnvironment): boolean {
	return BUILT_INS.has(name) && !environment.shadowedBuiltIns.has(name);
}

interface CollectedTypeDeclarations {
	readonly aliases: Map<string, Syntax<ESTree.TSTypeAliasDeclaration>>;
	readonly interfaces: Map<string, Syntax<ESTree.TSInterfaceDeclaration>[]>;
	readonly shadowedBuiltIns: Set<string>;
}

function recordAlias(
	declaration: Syntax<ESTree.TSTypeAliasDeclaration>,
	environment: CollectedTypeDeclarations,
): void {
	if (environment.aliases.has(declaration.id.name)) {
		environment.shadowedBuiltIns.add(declaration.id.name);
	} else {
		environment.aliases.set(declaration.id.name, declaration);
	}
}

function recordInterface(
	declaration: Syntax<ESTree.TSInterfaceDeclaration>,
	environment: CollectedTypeDeclarations,
): void {
	const declarations = environment.interfaces.get(declaration.id.name) ?? [];
	declarations.push(declaration);
	environment.interfaces.set(declaration.id.name, declarations);
}

function recordImports(
	declaration: Syntax<ESTree.ImportDeclaration>,
	shadowedBuiltIns: Set<string>,
): void {
	for (const specifier of declaration.specifiers) {
		if (BUILT_INS.has(specifier.local.name)) {
			shadowedBuiltIns.add(specifier.local.name);
		}
	}
}

function recordDeclaration(
	declaration: Syntax<ESTree.Node> | null,
	environment: CollectedTypeDeclarations,
): void {
	const name = declarationName(declaration);
	if (name !== null && BUILT_INS.has(name)) {
		environment.shadowedBuiltIns.add(name);
	}
	if (declaration?.type === "ImportDeclaration") {
		recordImports(declaration, environment.shadowedBuiltIns);
	} else if (declaration?.type === "TSTypeAliasDeclaration") {
		recordAlias(declaration, environment);
	} else if (declaration?.type === "TSInterfaceDeclaration") {
		recordInterface(declaration, environment);
	}
}

function createTypeEnvironment(
	program: Syntax<ESTree.Program>,
): TypeEnvironment {
	const environment: CollectedTypeDeclarations = {
		aliases: new Map(),
		interfaces: new Map(),
		shadowedBuiltIns: new Set(),
	};
	for (const statement of program.body) {
		recordDeclaration(declaredStatement(statement), environment);
	}
	return environment;
}

function isTransparentWrapper(
	name: string,
	environment: TypeEnvironment,
): boolean {
	return TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment);
}

export { createTypeEnvironment, isBuiltIn, isTransparentWrapper };
export type { TypeEnvironment };
