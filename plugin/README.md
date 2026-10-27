# MarkAtlas

**English** | [简体中文](README.zh-CN.md)

**Collect comments. Let AI act.**<br>
Developed by **Zihao Jing**

Read, understand, and edit project files with your AI assistant. MarkAtlas lets you collect comments across Markdown, code, and PDFs, review them together, and send a short request with separate context attachments to the current chat. Each comment keeps its file location; screenshot comments keep the image beside the matching request.

## Install in ChatGPT Desktop

MarkAtlas has been submitted to OpenAI for review. Public plugin search is not supported yet; if approved and published, it will be available from the public Plugins Directory. Until then, follow the [source installation guide](../README.md#install-from-source-in-chatgpt-desktop).

On macOS, download or clone the complete repository, install and sign in to ChatGPT Desktop with local plugin support, then run this from the repository root:

```sh
bash install-macos.command
```

The script installs Node.js 22/npm, Poppler PDF tools, and build dependencies, builds MarkAtlas, and opens the local plugin page. Finish with **Install** in ChatGPT Desktop, then open a local chat and ask to open MarkAtlas. Apple command-line tools may require completing an installation dialog and rerunning setup. Use `--with-codex` to also install the optional Codex CLI for background explanations, then run `codex` and sign in. LaTeX compilation requires a separately installed toolchain.

The repository's `.agents/plugins/marketplace.json` is a local catalog pointing to `plugin/`. Share the repository URL to let others download, build, and install their own copy; the catalog is separate from the public directory. Windows and Linux installation are not currently supported by this setup.

## Open a file or project

Use **Open file…** or the file icon beside the tree filter to select a single PDF, Markdown file, or code file. Files opened through the host's file entry also use this flow. Opening a local file also connects its parent folder and selects the file in that tree. Host file entrypoints use the original local path supplied by the host, even when the resource URI is opaque. Single PDFs use the same continuous viewer, zoom, selections, screenshot comments, explanations, and batch-send flow. Local files are read from their actual paths, so connected text files can autosave and local PDFs can refresh after changes.

Resource attachments and browser-selected files without exposed filesystem paths use a local working copy. Changes to that copy cannot overwrite an inaccessible original file. Host resource refresh is supported where resource reads remain available. Imported resources without an original path keep an isolated one-file tree. Local PDFs can discover neighboring LaTeX source in their connected parent folder.


Open MarkAtlas from its global or conversation entry. When the host supplies a workspace folder, its files can appear automatically. Otherwise, use the folder icon to connect a folder through the native chooser. The tree lists files without uploading a directory and loads contents when you open a file.

Use the filter to find files, click folder breadcrumbs to browse, and drag the tree's edge to adjust its width. Right-click a file or folder name for **Copy path** (the full filesystem path) or **Copy relative path** (relative to the connected project root). Full-path copying is unavailable for browser-only folders whose filesystem location is not exposed. Text files keep the tree open; opening a PDF collapses it to give the document more space.

## Comment, then send

With **Request edits** enabled, select a passage and write your comment in the floating panel. **Enter** saves the comment; **Command+Enter** inserts a new line. Selecting text in an editable document keeps focus in the document until you click the comment field.

The bottom bar counts files and annotations. Hover over it or click the count to preview the queue. Click the count again to close the preview. Delete individual comments with their remove controls, or use the floating **Cancel all** button above the preview. Turning Request edits off hides the bar without clearing the queue.

**Send** finishes pending autosaves, validates the remaining comments, and submits a short request immediately. The first context attachment contains shared project paths, file details, and comment-to-file mappings once. Each following attachment contains one numbered comment; screenshots stay beside their matching comments. The same send flow handles single-file and project reviews. Failed sends retain valid queued comments for retry. Successfully sent or deleted annotations are removed from both open files and cached drafts.

If the host has no available chat input, MarkAtlas keeps the annotations queued. Open the chat you want to use and retry **Send**, or choose **Send to new chat**. A failed send never automatically switches chats.

## Supported workflows

- **Markdown:** editable rendered and source views, tables, text selections, and comments.
- **Code and text:** a CodeMirror editor with highlighting for supported languages, undo/redo, text-size controls, and autosave for connected text files. Other UTF-8 text opens in a plain-text editor.
- **PDF:** continuous pages, vector page artwork, pointer-centered zoom, page navigation, selectable text where available, and cropped screenshot comments. Ordinary PDFs and source-free LaTeX PDFs can be displayed.
- **LaTeX:** PDF-to-source mapping through SyncTeX or text matching, source navigation, and automatic preview refresh after an external rebuild. The assistant edits `.tex` files and uses the user's installed build command; the plugin does not compile documents.
- **Images:** local previews of common image formats.
- **Office:** project-tree clicks hand off Word and Excel files to the host's native viewer. A read-only DOCX preview remains available for supported document inputs; it does not edit Word formatting or guarantee Word's exact pagination.

The **Edit** toggle switches Markdown and code between editable and read-only modes. Text edits autosave after a short pause. Saves check the disk version and stop on conflicts so external changes are not silently overwritten. Browser-picked files without a writable project connection keep edits as local drafts.

## Explanations

A comment and an explanation can coexist on the same selection. Switching between **Comment** and **Explanation** preserves each saved note, and deleting or sending a comment keeps its explanation. Select **Explanation**, then choose Short, Medium, or Long. The explanation appears inside the selection panel without opening or switching to another chat tab. While the model responds, the box says that this may take a few seconds. Hosts with MCP sampling use that service. Otherwise, the local server starts a fresh, ephemeral conversation through the signed-in Codex CLI, waits for its answer, and displays it in the same box. Both routes receive the full selected passage and any screenshot.

Choose the explanation model in the plugin's host settings. The CLI fallback requires a current Codex CLI installed and signed in, with access to that model. It runs in a temporary directory with a read-only sandbox and without loading user configuration; temporary prompts, screenshots, and replies are cleaned up afterward. Set `MARKATLAS_CODEX_PATH` in the server environment if the executable is outside PATH. Model access or sign-in failures appear in the explanation box.

## Annotations and changing files

Comments track text edits before sending. Deleted passages lose their comments automatically. Screenshot comments tied to an older PDF are removed rather than applied to a different image. Other external file changes require refreshing before the remaining review can be sent.

Version checks and annotation records stay internal. The final AI request uses project-relative paths where possible, current locations, compact excerpts, comments, and matching images. It does not include visible version hashes or annotation IDs. Changes made after sending cannot rewrite chat history; the assistant must verify the quoted passage against the current file before editing.

## Requirements and access

- A compatible desktop host with MCP Apps and native draft message support. Background explanations require MCP sampling or a signed-in Codex CLI.
- **Node.js 22 or newer** for running the plugin from source.
- **macOS** for the bundled native folder chooser. Building that helper requires Swift command-line tools.
- **Poppler** utilities (`pdftotext`, `pdftocairo`, and `pdftoppm`) for PDF review. SyncTeX improves LaTeX source mapping; compiling requires your own LaTeX installation.

Reads and writes are restricted to folders provided by the host, folders explicitly connected by the user, and the parent folders of explicitly opened local files. Imported resources without a local path remain isolated. The tree skips `.git`, `node_modules`, `.codex`, `.agents`, and `.aws`. It lists at most 5,000 files; text reads and saves are limited to 5 MB. PDFs are limited to 50 MB, 300 pages, and 5 MB of extracted text. Scanned PDFs without a text layer do not support text selection; use screenshot comments instead.

Drafts are stored locally when storage is available. Sending review context shares its comments, excerpts, and screenshots with the chat host; explanation requests share their selected content as well. Storage limits, particularly for screenshots, can affect draft recovery after reloads.

## Local development

From the repository root:

```sh
npm ci --include=dev --prefix plugin
npm run build --prefix plugin
npm run preview --prefix plugin -- /path/to/project
```

Open **http://127.0.0.1:4174/**. The development preview uses the native chooser and project-file access, but chat sending is mocked. A preview Send action does not submit a real model request. Explanation actions use the local Codex CLI and do request a real model response.

Run the plugin checks with:

```sh
npm test --prefix plugin
```

The root-level `npm start` command runs the earlier standalone browser prototype on port 4173. Use the plugin preview above for current MarkAtlas development.

The package keeps its original internal plugin and tool identifiers for compatibility; the public display name is **MarkAtlas**.

## Package a desktop build

On an Apple Silicon Mac with the development dependencies and Swift tools installed, run:

```sh
python3 plugin/desktop-pdf.py --fetch-sources
npm run pack:desktop --prefix plugin
```

This creates `releases/markatlas-VERSION-macos-arm64.zip` and its SHA-256 checksum. It bundles Node, the server's JavaScript dependencies, the viewer, native chooser, Poppler executables and libraries, matching PDF component sources/build recipes, and third-party notices, then extracts the ZIP and checks MCP startup, tool discovery, viewer loading, file reads/saves, PDF text extraction, and SVG/PNG rendering. Recipients do not need npm or a build step. They must install it using their host's supported local plugin flow; extracting a ZIP does not install a plugin.

This package supports macOS arm64 only. Poppler is included in this desktop build; explanations need host sampling or a signed-in Codex CLI. It is a development/distribution build, not a completed public submission. Publisher verification and local-MCP submission access, listing URLs, PNG icons, review materials, and portal checks are still required. When changing the bundled Node version, include that version's official license under `plugin/licenses/node-vVERSION.txt` before packaging.

When connecting a workspace, MarkAtlas automatically opens a README directly inside its root. Matching ignores case and prefers README.md, README.markdown, README, README.txt, then README.rst. A folder without a root README keeps the empty file prompt; nested READMEs are not chosen automatically. Routine tree refreshes preserve the current file.

### Plugin settings

The host plugin Settings page provides default file-tree position (left/right, default left), Markdown/PDF outline position (left/right, default left), and Show Git changes (enabled by default). Position changes apply to open viewers; the viewer context menus can temporarily override positions until the next opening or a changed default.

Theme color defaults to `host`, using the host-provided semantic accent colors. MarkAtlas also provides these explicit light/dark presets: blue, purple, pink, red, orange, yellow, green, teal, and gray. These are MarkAtlas presets, not a claimed enumeration of every host color.

**Clear Recently opened…** opens a confirmation panel. Cancel leaves history unchanged. Confirm invalidates only the file-tree Recently opened list; files, annotations, drafts, other caches, sorting and layout preferences are preserved. Open viewers check settings every three seconds while visible and on focus; closed viewers apply the history clear when reopened. Opening a project afterward starts new history.

### Preview changes and review patches

Select **Preview changes** next to **Send** to ask the assistant to propose changes without writing source files. The assistant uses `create_review_patch` with the exact current source and proposed text; binary files require an editable text source first. Each source folder stores proposals in `.markatlas/patches/` as a JSON record and a unified `.patch` file. Records retain the original source, proposed content, context, comments and revisions.
Saving and revising proposals does not depend on the project being open in the file tree or registered in the current MCP process. Reopening a file discovers its saved proposals, including when opened from an enclosing project folder. Applying a proposal still requires workspace access and source conflict checks.

**Review patches** appears for files with pending proposals. Multiple proposals open a selector. The document pane shows red deletions and green additions; select diff text to include it in a comment, save comments, or send them for another patch revision. **Edit proposed content** changes only the cached proposal. **Apply patches** writes the selected proposal after checking that both the source and patch revision are unchanged. A stale proposal is rejected instead of overwriting newer edits. Applied records remain in the cache but disappear from the pending list.

For PDFs with matched LaTeX source, the pending list includes the main source and project-local input files listed by the adjacent `.synctex` or `.synctex.gz` file. Without that mapping, only the confirmed main source is included. Applying a LaTeX patch does not automatically compile or replace the PDF.

The search dialog has **Search in project** and **Search in current file** tabs. Left/right arrow keys switch scopes, and the selected scope is remembered. Both scopes split whitespace-separated terms and match all terms on a line regardless of order. Current-file search uses the open working text, includes unsaved edits, ignores the project file mask, and can locate matching text in PDFs without switching to source mode.
