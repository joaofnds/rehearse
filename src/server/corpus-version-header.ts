/**
 * The response header the corpus file route names the version in, which an
 * edit review must start from, so an edit cannot overwrite a change made
 * after the file was opened.
 */
const CORPUS_VERSION_HEADER = "x-corpus-version";

export { CORPUS_VERSION_HEADER as default };
