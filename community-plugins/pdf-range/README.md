# PDF page ranges

A LearnHarness community plugin that lets you attach **only the pages you need** from a PDF.

## Why

When you attach a PDF to a session, the tutor reads the whole file. A 400-page textbook
fills the conversation's context with pages you aren't studying, which makes the session
slower, more expensive and less focused. This plugin cuts the PDF down to the pages you
choose **before** it is attached, so the tutor only sees that part.

## What it does

It adds a third item to the paperclip menu in the message box:

```
Files
Folder
PDF (choose pages)…   ← new
```

1. Click the paperclip, then **PDF (choose pages)…**.
2. Choose **Pages _from_ to _to_**, or **Whole PDF**.
3. Click **Choose PDF…**. The file manager opens, showing only PDFs.
4. The plugin runs [qpdf](https://qpdf.readthedocs.io/) to copy just those pages into a new
   file and attaches it to your message, exactly like a normal attachment.

**Whole PDF** attaches your original file unchanged, the same as the regular **Files** item.
The regular **Files** and **Folder** items keep working as before.

### Where the cut PDFs go

Cut files are saved in an `assets` folder next to LearnHarness's `data` folder, named
`<original name>_<from>_<to>.pdf`. For example, pages 1–22 of `xyz.pdf` become `xyz_1_22.pdf`:

| OS | Folder |
| --- | --- |
| Linux | `~/.config/LearnHarness/assets/` |
| macOS | `~/Library/Application Support/LearnHarness/assets/` |
| Windows | `%APPDATA%\LearnHarness\assets\` |

Your original PDF is never modified. You can delete files in `assets` whenever you like, but
past sessions that attached them won't be able to open them again.

### Details

- **Range past the end:** asking for pages 10–40 of a 12-page PDF attaches pages 10–12 and
  tells you the range was adjusted. If the first page doesn't exist, it says how many
  pages the PDF has and attaches nothing.
- **Same cut again:** cutting the same pages of the same PDF reuses the existing file
  instead of making a copy.
- **Same name, different PDF:** if another PDF with the same name was already cut with
  the same range, the new file gets a suffix (`xyz_3_7 (2).pdf`), so an earlier session's
  attachment is never overwritten.
- **Privacy:** everything happens on your computer. Nothing is uploaded; the cut file is
  attached by its local path, like any other attachment.

## Requirements

- **LearnHarness 0.6.0 or newer** (community plugins were added in 0.6.0). The plugin
  works with the official app; you don't need to build this fork.
- **qpdf** installed:

  | OS | Install |
  | --- | --- |
  | Ubuntu / Debian | `sudo apt install qpdf` |
  | Fedora | `sudo dnf install qpdf` |
  | Arch | `sudo pacman -S qpdf` |
  | macOS | `brew install qpdf` |
  | Windows | `winget install qpdf.qpdf`, or download it from the [qpdf releases](https://github.com/qpdf/qpdf/releases) and add its `bin` folder to your PATH |

  Check it works by running `qpdf --version` in a terminal.

> Tested on Linux (Ubuntu) with LearnHarness 0.6.1 and qpdf 12. macOS and Windows should
> work but haven't been tested yet. Please report what you find.

## Install

1. Download `pdf-range.zip` from this fork's
   [Releases](https://github.com/JuanFernandoSalazarSerrano/learnharness/releases), or
   copy the `community-plugins/pdf-range` folder from this repository.
2. Find your plugins folder. In LearnHarness, open **Settings → Community plugins**; it
   shows the exact path. Usually:

   | OS | Plugins folder |
   | --- | --- |
   | Linux | `~/.config/LearnHarness/data/plugins/` |
   | macOS | `~/Library/Application Support/LearnHarness/data/plugins/` |
   | Windows | `%APPDATA%\LearnHarness\data\plugins\` |

3. Put the plugin there so the files end up at:

   ```
   plugins/
     pdf-range/
       dist/
         manifest.json
         main.js
         backend.cjs
   ```

   The folder must be named `pdf-range` (it has to match the plugin's id), and the files
   must be inside `dist/`. No extra nested folder.
4. In **Settings → Community plugins**, click refresh, then turn on **PDF page ranges**.
   New plugins always start turned off.
5. Restart LearnHarness.

## Update

Replace the `pdf-range/dist/` folder with the new version and restart LearnHarness.

## Uninstall

Turn it off in **Settings → Community plugins**, or delete the `pdf-range` folder and
restart. Cut PDFs in `assets/` stay until you delete them.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No **PDF (choose pages)…** item in the menu | Make sure the plugin is turned on in **Settings → Community plugins**, and that the files are at `plugins/pdf-range/dist/`. Restart the app. |
| "qpdf is not installed or not on PATH." | Install qpdf (see Requirements) and restart LearnHarness. On macOS the plugin also looks in Homebrew's folders; on Windows, qpdf's `bin` folder must be on your PATH. |
| "Attaching files only works in the desktop app." | Attachments need local file paths, which only the desktop app provides, not LearnHarness opened in a browser. |
| An error from qpdf about the PDF | The PDF may be password-protected or damaged. Remove the password (or use **Whole PDF**) and try again. |

## How it works (for developers)

It's a standard LearnHarness community plugin (API v1, see
[`docs/plugin-authoring.md`](../../docs/plugin-authoring.md)) with no build step:

- **`dist/main.js`** (frontend): watches for the paperclip's menu
  (`[data-testid="attachment-popup"][role="menu"]`) and adds the menu item. It shows the
  range dialog with `ctx.ui.openDialog`, opens a PDF-only file picker, gets the file's
  local path through the desktop bridge (`window.lh.getPathForFile`), and inserts the
  result into the message box with the app's own `lh:insert-file-paths` event, the same
  event the built-in **Files** item uses.
- **`dist/backend.cjs`** (backend): registers a `cut` operation (`ctx.handle`) that
  validates the request, reads the page count with `qpdf --show-npages`, and writes the
  range with `qpdf --deterministic-id --empty --pages <file> <from>-<to> -- <out>`.
  qpdf runs without a shell (`execFile`), so file names can't inject commands.
  `--deterministic-id` makes identical cuts byte-identical, which is how existing
  files get reused.

Because the menu item is added to the app's existing menu rather than through a public
plugin API, a future LearnHarness redesign of the attach menu could hide it. If that
happens, the plugin simply won't show its item; nothing else breaks.
