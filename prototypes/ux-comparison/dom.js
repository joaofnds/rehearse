/**
 * @template {Element} T
 * @param {string} selector
 * @param {new () => T} elementType
 * @returns {T}
 */
export function required(selector, elementType) {
	const element = document.querySelector(selector);
	if (!(element instanceof elementType)) {
		throw new Error(`Missing ${selector}`);
	}
	return element;
}
