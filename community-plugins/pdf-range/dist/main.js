const INSERT_FILE_PATHS_EVENT = "lh:insert-file-paths";
const MENU_SELECTOR = '[data-testid="attachment-popup"][role="menu"]';
const EDITOR_SELECTOR = '[role="textbox"][contenteditable]';

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs)) {
		if (key === "className") node.className = value;
		else if (key === "text") node.textContent = value;
		else node.setAttribute(key, value);
	}
	for (const child of children) node.append(child);
	return node;
}

function insertPath(editor, filePath) {
	const target = editor?.isConnected ? editor : document.querySelector(`[data-attachment-composer] ${EDITOR_SELECTOR}`);
	if (!target) throw new Error("Could not find the message box to attach the PDF to.");
	target.focus();
	target.dispatchEvent(new CustomEvent(INSERT_FILE_PATHS_EVENT, { detail: [filePath] }));
}

export function activate(ctx) {
	const showMessage = (title, message) => {
		const handle = ctx.ui.openDialog({
			title,
			content: (container, signal) => {
				const ok = el("div", { className: "mt-4 flex justify-end" });
				container.append(
					el("h2", { className: "text-sm font-semibold", text: title }),
					el("p", { className: "mt-2 text-sm text-muted-foreground", text: message }),
					ok,
				);
				ctx.ui.mountButton(ok, { label: "OK", size: "sm", onClick: () => handle.dispose() }, { signal });
			},
		}, { signal: ctx.signal });
	};

	const pickPdf = (onPicked) => {
		const input = el("input", { type: "file", accept: ".pdf,application/pdf", hidden: "" });
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			input.remove();
			if (file) void onPicked(file);
		});
		input.addEventListener("cancel", () => input.remove());
		document.body.append(input);
		input.click();
	};

	const attach = async (editor, file, range) => {
		const resolve = window.lh?.getPathForFile;
		if (!resolve) { showMessage("Attach a PDF", "Attaching files only works in the desktop app."); return; }
		try {
			const source = resolve(file);
			if (!source) throw new Error("Could not read the location of that file.");
			if (!range) { insertPath(editor, source); return; }
			const result = await ctx.call("cut", { path: source, from: range.from, to: range.to });
			insertPath(editor, result.path);
			if (result.clamped) {
				showMessage("Page range adjusted", `This PDF has ${result.pages} pages, so pages ${result.from}–${result.to} were attached.`);
			}
		} catch (error) {
			showMessage("Could not attach the PDF", error instanceof Error ? error.message : String(error));
		}
	};

	const openRangeDialog = (editor) => {
		const handle = ctx.ui.openDialog({
			title: "Attach a PDF",
			content: (container, signal) => {
				const inputClass = "w-20 rounded-md border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring disabled:opacity-40";
				const whole = el("input", { type: "radio", name: "pdf-range-mode", value: "whole", id: "pdf-range-whole" });
				const partial = el("input", { type: "radio", name: "pdf-range-mode", value: "range", id: "pdf-range-range" });
				partial.checked = true;
				const from = el("input", { type: "number", min: "1", step: "1", value: "1", "aria-label": "From page", className: inputClass });
				const to = el("input", { type: "number", min: "1", step: "1", "aria-label": "To page", placeholder: "last", className: inputClass });
				const error = el("p", { className: "min-h-5 text-xs text-destructive", role: "alert" });
				const sync = () => { from.disabled = to.disabled = whole.checked; error.textContent = ""; };
				whole.addEventListener("change", sync);
				partial.addEventListener("change", sync);

				const cancelSlot = el("div");
				const chooseSlot = el("div");
				container.append(
					el("h2", { className: "text-sm font-semibold", text: "Attach a PDF" }),
					el("p", { className: "mt-1 text-xs text-muted-foreground", text: "Attach only the pages you need so large PDFs don't fill the conversation's context." }),
					el("div", { className: "mt-4 flex flex-col gap-3 text-sm" }, [
						el("label", { className: "flex items-center gap-2", for: "pdf-range-range" }, [partial, el("span", { text: "Pages" }),
							from, el("span", { className: "text-muted-foreground", text: "to" }), to]),
						el("label", { className: "flex items-center gap-2", for: "pdf-range-whole" }, [whole, el("span", { text: "Whole PDF" })]),
					]),
					error,
					el("div", { className: "mt-2 flex justify-end gap-2" }, [cancelSlot, chooseSlot]),
				);

				const submit = () => {
					let range = null;
					if (partial.checked) {
						const a = Number(from.value), b = Number(to.value);
						if (!Number.isInteger(a) || a < 1) { error.textContent = "Enter a first page of 1 or more."; from.focus(); return; }
						if (!to.value.trim() || !Number.isInteger(b) || b < 1) { error.textContent = "Enter the last page."; to.focus(); return; }
						if (b < a) { error.textContent = "The last page must be after the first page."; to.focus(); return; }
						range = { from: a, to: b };
					}
					handle.dispose();
					pickPdf((file) => attach(editor, file, range));
				};
				for (const input of [from, to]) input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } });

				ctx.ui.mountButton(cancelSlot, { label: "Cancel", variant: "ghost", size: "sm", onClick: () => handle.dispose() }, { signal });
				ctx.ui.mountButton(chooseSlot, { label: "Choose PDF…", size: "sm", onClick: submit }, { signal });
				sync();
				requestAnimationFrame(() => to.focus());
			},
		}, { signal: ctx.signal });
	};

	const addMenuItem = (menu) => {
		if (menu.querySelector("[data-pdf-range]")) return;
		const item = el("button", { type: "button", role: "menuitem", "data-pdf-range": "",
			className: "block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent", text: "PDF (choose pages)…" });
		item.addEventListener("click", () => {
			const paperclip = document.querySelector('[data-testid="attach-files"][aria-expanded="true"]');
			const editor = paperclip?.closest("[data-attachment-composer]")?.querySelector(EDITOR_SELECTOR) ?? null;
			paperclip?.click(); // toggles the host menu closed
			openRangeDialog(editor);
		});
		menu.append(item);
	};

	const scan = () => { for (const menu of document.querySelectorAll(MENU_SELECTOR)) addMenuItem(menu); };
	const observer = new MutationObserver(scan);
	observer.observe(document.body, { childList: true, subtree: true });
	scan();
	ctx.cleanup(() => {
		observer.disconnect();
		for (const item of document.querySelectorAll("[data-pdf-range]")) item.remove();
	});
}
