/** The corpus edit gate is held by work the refused work cannot overlap. */
export class CorpusEditBusyError extends Error {
	public override name = "CorpusEditBusyError";
}
