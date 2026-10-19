/** The corpus edit gate is held by work the refused work cannot overlap. */
class CorpusEditBusyError extends Error {
	public override name = "CorpusEditBusyError";
}

export { CorpusEditBusyError as default };
