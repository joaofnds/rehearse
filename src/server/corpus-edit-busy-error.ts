/** The other side of the corpus edit gate is running; try again once it is done. */
export class CorpusEditBusyError extends Error {
	public override name = "CorpusEditBusyError";
}
