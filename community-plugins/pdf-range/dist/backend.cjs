"use strict";
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const QPDF_CANDIDATES = ["qpdf", "/usr/local/bin/qpdf", "/opt/homebrew/bin/qpdf", "/usr/bin/qpdf"];

function run(args) {
	return new Promise((resolve, reject) => {
		const attempt = (i) => {
			execFile(QPDF_CANDIDATES[i], args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
				if (error && error.code === "ENOENT" && i + 1 < QPDF_CANDIDATES.length) return attempt(i + 1);
				if (error && error.code === "ENOENT") return reject(new Error("qpdf is not installed or not on PATH."));
				// qpdf exit code 3 = succeeded with warnings (common on slightly damaged PDFs).
				if (error && error.code !== 3) return reject(new Error((stderr || error.message).trim()));
				resolve(stdout);
			});
		};
		attempt(0);
	});
}

function positiveInt(value, name) {
	if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a whole number of 1 or more.`);
	return value;
}

function sameBytes(a, b) {
	try {
		const sa = fs.statSync(a), sb = fs.statSync(b);
		return sa.size === sb.size && fs.readFileSync(a).equals(fs.readFileSync(b));
	} catch { return false; }
}

async function cut(input, assetsDir) {
	if (!input || typeof input !== "object") throw new Error("Invalid request.");
	const source = input.path;
	if (typeof source !== "string" || !path.isAbsolute(source) || source.includes("\0")) throw new Error("Invalid PDF path.");
	if (!/\.pdf$/i.test(source)) throw new Error("Please choose a .pdf file.");
	if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile()) throw new Error("That PDF no longer exists.");
	const from = positiveInt(input.from, "From page");
	let to = positiveInt(input.to, "To page");
	if (to < from) throw new Error("The last page must be after the first page.");

	const pages = Number.parseInt(String(await run(["--show-npages", source])).trim(), 10);
	if (!Number.isInteger(pages) || pages < 1) throw new Error("Could not read the number of pages in this PDF.");
	if (from > pages) throw new Error(`This PDF only has ${pages} page${pages === 1 ? "" : "s"}.`);
	const clamped = to > pages;
	if (clamped) to = pages;

	fs.mkdirSync(assetsDir, { recursive: true });
	const base = path.basename(source).replace(/\.pdf$/i, "");
	const stem = `${base}_${from}_${to}`;
	const tmp = path.join(assetsDir, `.${stem}.${process.pid}.${Date.now()}.tmp.pdf`);
	try {
		await run(["--deterministic-id", "--empty", "--pages", source, `${from}-${to}`, "--", tmp]);
		// Reuse an identical earlier cut; never overwrite a different PDF with the same name.
		for (let n = 1; ; n++) {
			const target = path.join(assetsDir, n === 1 ? `${stem}.pdf` : `${stem} (${n}).pdf`);
			if (!fs.existsSync(target)) { fs.renameSync(tmp, target); return { path: target, from, to, pages, clamped }; }
			if (sameBytes(tmp, target)) { fs.rmSync(tmp, { force: true }); return { path: target, from, to, pages, clamped }; }
		}
	} catch (error) {
		fs.rmSync(tmp, { force: true });
		throw error;
	}
}

exports.activate = function activate(ctx) {
	const assetsDir = path.join(path.dirname(ctx.learning.directory), "assets");
	ctx.handle("cut", (input) => cut(input, assetsDir));
};
