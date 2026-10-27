<p align="center">
  <img src="plugin/assets/icon.svg" width="64" height="64" alt="MarkAtlas icon">
</p>

<h1 align="center">MarkAtlas</h1>
<p align="center"><strong>Collect comments. Let AI act.</strong><br>Developed by Zihao Jing</p>

<p align="center"><strong>English</strong> | <a href="README.zh-CN.md">简体中文</a></p>

MarkAtlas turns your file review into a clear request for your AI assistant. Read a document, select the passages that need attention, and leave comments where they belong. When you are ready, click **Send** to submit a short request with each comment as a separate context attachment, including file locations, concise excerpts, and screenshots.

Review the whole picture before asking AI to act.

## From reading to action

1. **Open a file or project.** Select a local file to open its parent folder and focus that file, or connect a project folder directly.
2. **Mark what matters.** Select text to comment, or capture a PDF region to discuss a figure, table, or layout.
3. **Keep working.** Edit Markdown and code while collecting comments. Connected text files autosave, and comments follow your edits.
4. **Review and send.** Preview the queue, remove individual comments or cancel them all, then click **Send** to submit the request immediately with separate context attachments.

The review bar shows how many files and annotations are queued. Each context piece includes its file location, and numbered comments keep screenshots connected to their requests. Attached and deleted annotations leave no lingering highlights in the viewer.


## One workspace for different files

<p align="center"><img src="docs/gifs/00-supported-files.png" width="600" alt="Supported file types in MarkAtlas"></p>

> MarkAtlas support Markdown, code, plain text, LaTeX, PDF, and image.


| Format | What you can do |
| --- | --- |
| **Markdown** | Read and edit rendered content or source, including tables, and comment in either view. |
| **Code and plain text** | Edit with syntax highlighting for supported languages, autosave connected files, and annotate specific selections. |
| **PDF** | Read continuous pages, zoom around the pointer, select available text, and comment on screenshot regions. No source document is required to view a PDF. |
| **LaTeX projects** | Map PDF selections to `.tex` locations using SyncTeX when available, with text matching as a fallback. Ask AI to edit the source and rebuild using your installed toolchain. |
| **Images** | Preview images alongside the rest of your project. |

Office files opened from the project tree use the host application's native viewer. MarkAtlas also includes a read-only DOCX preview for supported document inputs.


## Understand before you change

Choose **Explanation** on a selection with a detail level and optinally prompt for explanation. MarkAtlas displays the AI explanation in the selection panel without opening another chat tab. It uses host MCP sampling when available, with a fresh background Codex CLI conversation as the fallback. These requests include the complete selection and any attached screenshot, so the explanation model has the context it needs.

<p align="center"><img src="docs/gifs/01-comment-and-explain.gif" width="900" alt="Select text, add a comment, or ask for an explanation"></p>

> Select text, leave a comment describing the change you want, or ask for an explanation directly in the document.

## Comments that follow your work

Annotations track edits before you send. Deleting an annotated passage removes its comment; screenshot comments tied to an older PDF are removed as well. Sending finishes pending autosaves and checks the remaining file references. If a file changed externally, refresh it before sending the review.

The final request uses the current locations and preserves your existing edits. Files can still change after sending, so the assistant is instructed to match the quoted passages before making changes.

<p align="center"><img src="docs/gifs/02-review-comments.gif" width="900" alt="Open and filter comments and explanations, then jump to a comment in the document"></p>

> Left: Open and filter the current file's comments and explanations. Right: Jump from a comment to its location in the document.

<p align="center"><img src="docs/gifs/03-send-review-request.gif" width="800" alt="Generate patches without changing the file, send a request, and open the completed chat response"></p>

> Workflow: Leave a comment on selected contents, send the review request, and open the  chat session by clicking the bottom floating card.

## Review before changing

MarkAltas supports **patch-only** mode. By toggle **Patches** before send, the AI agent will only generate patches without changing the original file. You can preview a proposed patch, ask for revisions directly in patch view, and apply it only when it is ready. The original file stays intact while you review the suggested changes.

<p align="center"><img src="docs/gifs/04-review-and-revise-patch.gif" width="900" alt="Send a review request with patch generation enabled, then request a revision and receive an updated proposal"></p>

> Send a review request with "patch-only" enabled; Feel free to add follow-up comments on the proposed changes to request a revision and receive an updated proposal.


<p align="center"><img src="docs/gifs/05-apply-updated-patch.gif" width="800" alt="Refresh the patch, accept the current changes, and apply them to the original file"></p>

> Refresh the patch to see the latest version; When the changes are ready, accept and apply the current patches; Go back to the original file to view the updated version.

## File access and AI context

The file tree lists names first and reads file contents when you open them. A folder connection does not upload the directory. Opening a local file also connects its containing folder. Host-provided original paths are preserved; attachments without a local path use an isolated working copy. Draft comments stay local until you send them to chat or request an explanation. Those actions share the relevant comments, selected text or excerpts, and screenshots with the host's AI service.

Markdown and code editing write to connected project files. Ordinary PDF review does not provide direct PDF content editing. LaTeX compilation uses your own installation and is run by the assistant or by you; MarkAtlas does not bundle a compiler or expose a Build button.

## Install from source in ChatGPT Desktop

**MarkAtlas has been submitted to OpenAI for review. Public plugin search is not supported yet. If approved and published, you will be able to find and install MarkAtlas directly from the public Plugins Directory. For now, install from this repository.**

The source setup below is for **macOS**, with a ChatGPT Desktop version that supports local plugins, MCP Apps, and local chats. The native file/folder picker requires macOS and Apple's Swift command-line tools; Windows and Linux setup are not currently supported. Install and sign in to [ChatGPT Desktop](https://learn.chatgpt.com/docs/quickstart?setup=app) first.

### 1. Download this repository

On GitHub, select **Code → Download ZIP**, extract the archive, and open Terminal in the extracted folder. Alternatively, if Git is installed:

```sh
git clone https://github.com/zihao-jing/gpt-commenter.git
cd gpt-commenter
```

Keep the complete repository, including its hidden `.agents` folder.

### 2. Run the setup script

From the repository folder:

```sh
bash install-macos.command
```

The [setup script](install-macos.command) checks Apple's command-line tools, installs [Homebrew](https://brew.sh/) if needed, installs **Node.js 22 and npm** plus **Poppler** (`pdftotext`, `pdftocairo`, and `pdftoppm`), installs the locked npm dependencies, and builds the viewer, MCP server, and native file picker. The PDF viewer is part of MarkAtlas; no separate PDF reader is required. Run as your normal user, without `sudo`; Homebrew may request your password. If the Apple tools installation dialog appears, finish it and rerun the script.

For background explanations on hosts without MCP sampling, also install Codex CLI:

```sh
bash install-macos.command --with-codex
```

Afterward, run `codex` in Terminal and sign in. See the [Codex CLI guide](https://learn.chatgpt.com/docs/codex/cli). LaTeX compilation and precise SyncTeX mapping additionally require your own LaTeX toolchain; they are optional for ordinary PDF review. The setup script does not install a TeX distribution.

### 3. Finish installation in ChatGPT Desktop

The script opens MarkAtlas's **local plugin page** in ChatGPT Desktop and prints the same link in Terminal. Select **Install** and approve the requested access. If necessary, restart ChatGPT Desktop and open the printed link again. Use `bash install-macos.command --no-open` to build and print the link without opening it.

Open a chat that runs locally and ask **“Open MarkAtlas so I can review my files.”** Connect a project folder or open a file, then start reviewing Markdown, code, or PDFs. Scanned PDFs can be displayed, but text selection requires an existing text layer.

This uses the repository's [local marketplace catalog](.agents/plugins/marketplace.json), which points to `./plugin`. A local marketplace is a catalog of plugin folders, not a public listing or a hosted download service. You can share this repository URL with other users: each user downloads their own copy, runs setup, and installs from its local page. They do not need access to your computer. See OpenAI's [local plugin packaging guide](https://developers.openai.com/plugins/build/plugins) and [local plugin links](https://learn.chatgpt.com/docs/reference/commands#local-plugin).

### Manual setup and updates

If Homebrew and Apple's Swift command-line tools are already installed, the build steps are:

```sh
brew install node@22 poppler
export PATH="$(brew --prefix node@22)/bin:$(brew --prefix)/bin:$PATH"
npm ci --include=dev --prefix plugin
npm run build --prefix plugin
```

Run `bash install-macos.command` to open the local installation page afterward. Building alone does not install the plugin in ChatGPT Desktop. If the app does not recognize the link, update it to a version with local plugin support; managed workspaces may restrict local plugins.

To update a Git checkout, run `git pull` and rerun the setup script. Refresh or reinstall the local plugin in ChatGPT Desktop and restart the app so it loads the rebuilt files. ChatGPT installs a cached copy, so editing this checkout alone may not update the running plugin.

See the [plugin guide](plugin/README.md) for controls, troubleshooting, and local development.

---

**MarkAtlas** · Developed by **Zihao Jing**<br>
Collect comments. Let AI act.

## Third-party components and acknowledgements

Partial style(s) is(are) sourced or adapted from Blue Topaz (https://github.com/PKM-er/Blue-Topaz_Obsidian-css), and I would like to express my appreciation to WhyI (https://github.com/whyt-byte) and pkmer.cn (https://pkmer.cn).

The theme is MIT-licensed; its copyright notice and full license are preserved in [blue-topaz.css](plugin/assets/obsidian/blue-topaz.css).

## Support and policies

[Support](docs/SUPPORT.md) · [Privacy](docs/PRIVACY.md) · [Terms](docs/TERMS.md)

The separate Apple Silicon desktop distribution bundles Node and PDF tools. The source installation above builds from this repository and uses locally installed PDF tools.
