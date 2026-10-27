import {patchStore} from './src/patch-store.js';
import {revealInFinder} from './src/finder.js';
import {webPreviewService} from './src/web-preview.js';
import {singleFileService} from './src/single-file.js';
import {prepareReviewBatch} from './src/prepare-review-batch.js';
import {readFileSync,writeFileSync} from 'node:fs';import {createServer} from 'node:http';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createFolderPicker} from './src/folder-picker.js';
import {workspaceAccess} from './src/workspace.js';
import {latexService} from './src/latex.js';
import {reviewStore} from './src/review-store.js';
import {explanationStore} from './src/explanations.js';
import {generateExplanation} from './src/background-explanation.js';
import {explanationSettings,settingsSchema,settingsLayout,presentSettings} from './src/explanation-settings.js';
const base=fileURLToPath(new URL('.',import.meta.url)),root=resolve(process.argv[2] || process.cwd());
const chooseFolder=createFolderPicker({bundle:join(base,'dist/FolderPicker.app')}),chooseFile=createFolderPicker({mode:'file',bundle:join(base,'dist/FolderPicker.app')});
const workspace=workspaceAccess(async()=>[{uri:new URL('file://'+root).href}]),latex=latexService(workspace),reviews=reviewStore(join(tmpdir(),'commenter-latex-state')),explanations=explanationStore(join(tmpdir(),'commenter-latex-state'));
const patches=patchStore(workspace,latex);
const webPreviews=webPreviewService(workspace);
const singleFiles=singleFileService(workspace,join(tmpdir(),'commenter-latex-state'));
let source=readFileSync(`${base}/src/viewer.js`,'utf8');
source=source.replace("import {App} from '@modelcontextprotocol/ext-apps';",`class App {constructor(){this.handlers={};}addEventListener(n,cb){this.handlers[n]=cb;}async connect(){}async openLink({url}){window.open(url,'_blank','noopener');return {};}getHostContext(){return {theme:'light'};}async callServerTool(params){return (await fetch('/api',{method:'POST',body:JSON.stringify(params)})).json();}}`);
source=source.replace("import {OpenAIExtensions, OpenAIFileEntrypointInputSchema} from '@openai/mcp-extensions/app';",`class OpenAIExtensions {constructor(){this.message={send:async params=>{await fetch('/message',{method:'POST',body:JSON.stringify(params)});return {};}};}} const OpenAIFileEntrypointInputSchema={safeParse:()=>({success:false})};`);
const bundle=await build({stdin:{contents:source,resolveDir:`${base}/src`},bundle:true,format:'iife',write:false});const html=readFileSync(`${base}/src/viewer.html`,'utf8').replace('/* OBSIDIAN_THEME */',()=>readFileSync(`${base}/dist/obsidian.css`,'utf8')).replace('/* VIEWER_SCRIPT */',()=>bundle.outputFiles[0].text);
createServer(async(req,res)=>{
 if(req.url==='/api' || req.url==='/message'){
  let body='';for await(const chunk of req)body+=chunk;
  res.setHeader('Content-Type','application/json');
  if(req.url==='/message'){writeFileSync(join(tmpdir(),'latex-preview-message.json'),body);res.end('{}');return;}
  try{const {name,arguments:a}=JSON.parse(body);let data;
   if(name==='list_review_patches')data=await patches.list(a.root,a.path);
   else if(name==='read_review_patch')data=await patches.read(a.root,a.path,a.id);
   else if(name==='create_review_patch')data=await patches.create(a);
   else if(name==='update_review_patch')data=await patches.update(a);
   else if(name==='apply_review_patch')data=await patches.apply(a);
   else if(name==='markatlas_settings_read')data={...presentSettings(await explanationSettings().read()),recentHistoryRevision:await explanationSettings().historyRevision()};
   else if(name==='open_html_web_preview')data=await webPreviews.open(a.root,a.path);
   else if(name==='open_review_single_file')data=await singleFiles.open(a);
   else if(name==='choose_review_file'){const path=await chooseFile();data=path?await singleFiles.open({path}):{cancelled:true};}
   else if(name==='list_markdown_project')data=await workspace.list(a.folderPath);
   else if(name==='choose_markdown_project_folder'){const folder=await chooseFolder();data=folder ? await workspace.list(folder) : {cancelled:true};}
   else if(name==='reveal_review_project_file')data=await revealInFinder(workspace,a.root,a.path);
   else if(name==='resolve_native_office_file')data=await workspace.nativeOfficePath(a.root,a.path);
   else if(name==='read_markdown_project_file')data=await workspace.read(a.root,a.path,a.ifNoneMatch);
   else if(name==='create_review_project_entry')data=await workspace.create(a.root,a.folder,a.name,a.kind);
   else if(name==='rename_review_project_file'){data=await workspace.rename(a.root,a.path,a.name);await reviews.renamed(a.root,a.path,data.path);}
   else if(name==='move_review_project_file')data=await workspace.move(a.root,a.path,a.folder);
   else if(name==='save_review_project_file')data=await workspace.save(a.root,a.path,a.text,a.expectedEtag);
   else if(name==='paste_review_project_image')data=await workspace.addImage(a.root,a.folder,a.mime,a.data);
   else if(name==='read_latex_pdf')data=await latex.read(a.root,a.path,a.ifNoneMatch);
   else if(name==='render_latex_pdf_page')data=await latex.page(a.root,a.path,a.page,a.fingerprint,a.format ?? 'svg');
   else if(name==='locate_latex_pdf_selection')data=await latex.locate(a.root,a.path,a.selection);
   else if(name==='prepare_review_batch')data={entries:await prepareReviewBatch(a.entries,{reviews,workspace,latex})};
   else if(name==='read_markatlas_pane'){await workspace.resolve(a.root,a.path);data={html:html.replace('<script>','<script>window.__markatlasPane='+JSON.stringify(a).replaceAll('<','\\u003c')+';')};}
   else if(name==='review_project_state'){await workspace.resolve(a.root,'.');data=await reviews.project(a.root,a.state);}
   else if(name==='update_review_document')data=await reviews.update(a);
   else if(name==='generate_review_explanation'){const result=await generateExplanation({getClientCapabilities:()=>({})},await explanationSettings().read(),a.annotation);const record=await explanations.create(a.annotation);await explanations.answer(record.requestId,result.answer);data={requestId:record.requestId,status:'answered',...result};}
   else if(name==='create_markdown_explanation')data=await explanations.create(a.annotation);
   else if(name==='read_markdown_explanation')data=await explanations.read(a.requestId);
   else throw Error('Unsupported preview tool: '+name);
   res.end(JSON.stringify({structuredContent:data}));
  }catch(error){res.end(JSON.stringify({isError:true,content:[{type:'text',text:error.message}]}));}return;
 }
 res.setHeader('Content-Type','text/html');res.end(html);
}).listen(Number(process.env.MARKATLAS_PREVIEW_PORT||4174),'127.0.0.1',()=>console.log('Viewer preview port: '+(process.env.MARKATLAS_PREVIEW_PORT||4174)));
