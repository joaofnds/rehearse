interface ConfirmationRepResult {
	readonly recordFile: string;
	readonly preservedWorktree: boolean;
}

interface CompletedConfirmationRep {
	readonly targetRoot: string;
	readonly retentionName: string;
	readonly resultSha: string;
	readonly recordFile: string;
	readonly recordContent: string;
	readonly worktreePath: string;
	readonly recordRetentionRef: (
		targetRoot: string,
		retentionName: string,
		resultSha: string,
	) => Promise<void>;
	readonly removeWorktree: (
		targetRoot: string,
		worktreePath: string,
	) => Promise<void>;
}

async function settleCompletedConfirmationRep(
	rep: Readonly<CompletedConfirmationRep>,
): Promise<ConfirmationRepResult> {
	await rep.recordRetentionRef(
		rep.targetRoot,
		rep.retentionName,
		rep.resultSha,
	);
	await Bun.write(rep.recordFile, rep.recordContent);
	await rep.removeWorktree(rep.targetRoot, rep.worktreePath);

	return { preservedWorktree: false, recordFile: rep.recordFile };
}

interface DiagnosticConfirmationRep {
	readonly recordFile: string;
	readonly recordContent: string;
	readonly worktreeCreated: boolean;
	readonly preservedMessage: string;
	readonly log: (message: string) => void;
}

async function settleDiagnosticConfirmationRep(
	rep: Readonly<DiagnosticConfirmationRep>,
): Promise<ConfirmationRepResult> {
	await Bun.write(rep.recordFile, rep.recordContent);
	if (rep.worktreeCreated) {
		rep.log(rep.preservedMessage);
	}

	return {
		preservedWorktree: rep.worktreeCreated,
		recordFile: rep.recordFile,
	};
}

export { settleCompletedConfirmationRep, settleDiagnosticConfirmationRep };
export type { ConfirmationRepResult };
