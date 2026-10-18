import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Button } from "#client/system/ui/button";
import { ActionGroup } from "#client/system/components/action-group";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";
import type { EvidenceSourceIdentity } from "./evidence-source-query";
import { EvidenceSourcePage } from "./evidence-source-page";

function evidenceHref(identity: EvidenceSourceIdentity): string {
	const run = encodeURIComponent(identity.run);
	const item = encodeURIComponent(identity.item);
	const index = encodeURIComponent(identity.index);
	if (identity.kind === "final") {
		return `/runs/${run}/final/evidence/${item}/${index}`;
	}
	return `/runs/${run}/stages/${encodeURIComponent(identity.stage)}/evidence/${encodeURIComponent(identity.section)}/${item}/${index}`;
}

/** A primary click inspects the citation beside its source run; the href remains shareable. */
export function EvidenceDialogLink({
	identity,
	children,
}: {
	readonly identity: EvidenceSourceIdentity;
	readonly children: ReactNode;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);
	const suppressTriggerOpen = useRef(false);
	const href = evidenceHref(identity);
	const label =
		identity.kind === "stage"
			? `${identity.stage} Judge · ${identity.item}`
			: `Final Judge · ${identity.item}`;

	function clicked(
		event: Readonly<
			Pick<
				MouseEvent<HTMLAnchorElement>,
				| "button"
				| "metaKey"
				| "ctrlKey"
				| "shiftKey"
				| "altKey"
				| "preventDefault"
			>
		>,
	): void {
		if (
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			suppressTriggerOpen.current = true;
			return;
		}
		event.preventDefault();
		suppressTriggerOpen.current = false;
		setOpen(true);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next || !suppressTriggerOpen.current) {
					setOpen(next);
				}
				suppressTriggerOpen.current = false;
			}}
		>
			<DialogTrigger asChild>
				<a href={href} onClick={clicked}>
					{children}
				</a>
			</DialogTrigger>
			<DialogContent width="wide">
				<div className="flex flex-none flex-wrap items-start justify-between gap-3 border-b border-divider px-6 py-4">
					<div className="min-w-0 wrap-anywhere">
						<DialogTitle>Cited source</DialogTitle>
						<DialogDescription>{label}</DialogDescription>
					</div>
					<ActionGroup>
						<Button asChild variant="quiet" size="compact">
							<Link to={href}>Open full page</Link>
						</Button>
						<DialogClose asChild>
							<Button variant="outline" size="compact">
								Close
							</Button>
						</DialogClose>
					</ActionGroup>
				</div>
				<EvidenceSourcePage identity={identity} embedded />
			</DialogContent>
		</Dialog>
	);
}
