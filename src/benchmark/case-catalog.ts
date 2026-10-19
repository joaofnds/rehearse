import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { relative } from "node:path";

import {
	CaseDeclarationError,
	isCaseId,
	parseCaseDeclaration,
} from "./case-declaration";
import type { CaseDeclaration } from "./case-declaration";
import { caseDeclarationPath, casesRoot } from "./case-paths";
import { CONTROL_DIR } from "./config";

async function readCaseDeclaration(
	id: string,
	root: string = casesRoot(),
): Promise<CaseDeclaration> {
	if (!isCaseId(id)) {
		throw new CaseDeclarationError(
			`Unknown case ${id}: a case id is lowercase letters, digits, or dashes`,
		);
	}

	const path = caseDeclarationPath(id, root);
	const readDeclarationText = async (): Promise<string> => {
		try {
			const file = Bun.file(path);
			if (!(await file.exists())) {
				throw new CaseDeclarationError(
					`Unknown case ${id}: no declaration at ${relative(CONTROL_DIR, path)}`,
				);
			}

			return await file.text();
		} catch (error) {
			if (error instanceof CaseDeclarationError) {
				throw error;
			}

			throw new CaseDeclarationError(
				`Cannot read case ${id} declaration at ${relative(CONTROL_DIR, path)}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	const text = await readDeclarationText();

	return parseCaseDeclaration(id, text);
}

interface UnreadableCase {
	readonly id: string;
	readonly reason: string;
}

interface CaseListing {
	readonly declarations: readonly CaseDeclaration[];
	readonly unreadable: readonly UnreadableCase[];
}

async function readCaseDirectoryNames(
	directory: string,
): Promise<readonly string[]> {
	const readCaseEntries = async (): Promise<Dirent[]> => {
		try {
			return await readdir(directory, { withFileTypes: true });
		} catch {
			throw new CaseDeclarationError(
				`No case directory at ${relative(CONTROL_DIR, directory)}`,
			);
		}
	};

	const entries = await readCaseEntries();

	return entries
		.filter((entry) => entry.isDirectory())
		.map(({ name }) => name)
		.toSorted((left, right) => left.localeCompare(right));
}

/**
 * A directory that holds no readable declaration is reported rather than
 * thrown, because a half-written case must not hide the cases that do read.
 */
async function listCases(
	root: string = casesRoot(),
	{ includeArchived = false }: { readonly includeArchived?: boolean } = {},
): Promise<CaseListing> {
	const declarations: CaseDeclaration[] = [];
	const unreadable: UnreadableCase[] = [];

	await Array.fromAsync(await readCaseDirectoryNames(root), async (id) => {
		try {
			const declaration = await readCaseDeclaration(id, root);
			if (includeArchived || declaration.archived !== true) {
				declarations.push(declaration);
			}
		} catch (error) {
			if (!(error instanceof CaseDeclarationError)) {
				throw error;
			}

			unreadable.push({ id, reason: error.message });
		}
	});

	return { declarations, unreadable };
}

export { readCaseDeclaration, listCases };
export type { UnreadableCase, CaseListing };
