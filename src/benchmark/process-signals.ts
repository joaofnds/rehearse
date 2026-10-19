type SignalStopOutcome =
	| { readonly kind: "ignored" }
	| { readonly kind: "stopped"; readonly code: number };

type SignalStopHandler = (signal: NodeJS.Signals) => Promise<SignalStopOutcome>;
type SignalListener = (signal: NodeJS.Signals) => void;

interface SignalRegistration {
	readonly registerSignal: (
		signal: NodeJS.Signals,
		handler: SignalStopHandler,
	) => void;
	readonly releaseSignal: (
		signal: NodeJS.Signals,
		handler: SignalStopHandler,
	) => void;
}

function rememberListener(
	listeners: Map<SignalStopHandler, SignalListener>,
	handler: SignalStopHandler,
	listener: SignalListener,
): SignalListener {
	listeners.set(handler, listener);
	return listener;
}

function processSignals(flush: () => Promise<void>): SignalRegistration {
	const listeners = new Map<
		NodeJS.Signals,
		Map<SignalStopHandler, SignalListener>
	>();

	return {
		registerSignal: (signal, handler) => {
			const forSignal =
				listeners.get(signal) ?? new Map<SignalStopHandler, SignalListener>();

			listeners.set(signal, forSignal);
			process.on(
				signal,
				rememberListener(forSignal, handler, (received) => {
					void (async () => {
						const outcome = await handler(received);
						if (outcome.kind === "ignored") {
							return;
						}

						try {
							await flush();
						} finally {
							process.exit(outcome.code);
						}
					})();
				}),
			);
		},
		releaseSignal: (signal, handler) => {
			const forSignal = listeners.get(signal);
			const listener = forSignal?.get(handler);

			if (listener !== undefined) {
				process.off(signal, listener);
				forSignal?.delete(handler);
			}
		},
	};
}

export { processSignals as default };
export type { SignalStopOutcome, SignalStopHandler, SignalRegistration };
