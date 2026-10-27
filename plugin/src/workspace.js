import {gitTreeChanges,applyGitTree} from './git-tree.js';
import {randomUUID} from 'node:crypto';
import {isSupportedText,isOfficeTemporary} from './file-types.js';
import {fileContent,fileLimit} from './file-content.js';
import {readdir,realpath,readFile,stat,lstat,link,open,rename,unlink,mkdir,rmdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,basename,dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildProject} from './project.js';
const fileVersion=info=>[info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs].join(':');
const ignored=new Set(['.markatlas','.git','node_modules','.codex','.agents','.aws']);
async function existingPath(path){
  try{return await realpath(path);}catch(error){
    if(error.code==='ENOENT')throw Object.assign(Error(`File or folder not found: ${path}. It may have been moved or deleted. Refresh the file tree or choose an existing file.`),{code:'ENOENT'});
    throw error;
  }
}
export function workspaceAccess(getRoots,fallback=process.env.GPT_COMMENTER_PROJECT_ROOT) {
  let allowed=[];
  const connected=new Set(),singleFiles=new Map();
  async function roots() {
    let advertised=[];
    try{advertised=await getRoots();}catch{
      // Retry a transient host roots RPC once; never mistake an RPC failure for revoked access.
      try{advertised=await getRoots();}catch{throw Error('Could not refresh project access. Please try again.');}
    }
    const paths=advertised.filter(x=>x.uri?.startsWith('file:')).map(x=>fileURLToPath(x.uri));
    if(!paths.length && fallback)paths.push(fallback);
    allowed=await Promise.all(paths.map(p=>realpath(p)));
    return allowed;
  }
  async function inside(root,path) {
    root=await realpath(root);
    const folderAccess=allowed.includes(root) || connected.has(root);
    if(!folderAccess && !singleFiles.has(root))throw Error('Project is no longer available. Refresh the file tree.');
    const target=await existingPath(resolve(root,path)),rel=relative(root,target);
    if(rel.startsWith('..') || isAbsolute(rel) || rel.split('/').some(p=>ignored.has(p)))throw Error('File is outside the project.');
    if(!folderAccess && !singleFiles.get(root)?.has(target))throw Error('Only the selected file is connected. Open its folder to access other files.');
    return target;
  }
  return {
    async connectFile(filePath){
      if(!isAbsolute(filePath))throw Error('Choose a local file.');
      const target=await existingPath(filePath),info=await stat(target);
      if(!info.isFile())throw Error('Choose a file, not a folder.');
      await roots();
      const folders=[...allowed,...connected].filter(folder=>{const rel=relative(folder,target);return !rel.startsWith('..') && !isAbsolute(rel);}).sort((a,b)=>b.length-a.length);
      const root=folders[0] || dirname(target),path=relative(root,target);
      if(!singleFiles.has(root))singleFiles.set(root,new Set());singleFiles.get(root).add(target);
      return {singleFile:true,singlePath:path,rootPath:root,root:{name:basename(root),type:'directory',path:'',children:[{type:'file',name:basename(target),path,supported:true}]}};
    },
    async sourceDiscoveryAllowed(root){await roots();root=await realpath(root);return allowed.includes(root) || connected.has(root);},
    async resolve(root,path){await roots();return inside(root,path);},
    async nativeOfficePath(root,path){
      await roots();const target=await inside(root,path);
      if(!/\.(docx|xlsx)$/i.test(target) || !(await stat(target)).isFile())throw Error('Choose a Word (.docx) or Excel (.xlsx) file.');
      return {path:target};
    },
    async list(folderPath) {
      let root;
      if(folderPath !== undefined) {
        const input=folderPath.trim().replace(/^~(?=\/|$)/,homedir());
        if(!isAbsolute(input))throw Error('Enter an absolute folder path, such as /Users/you/project.');
        root=await realpath(input);
        if(!(await stat(root)).isDirectory())throw Error('Choose a folder, not a file.');
      } else [root]=await roots();
      if(!root)throw Error('No workspace folder was shared by the app. Use Open folder to connect a local folder.');
      const files=[],folders=[],directoryTimes=new Map();let omitted=0;
      async function walk(dir,prefix='',depth=0) {
        directoryTimes.set(prefix,(await stat(dir)).mtimeMs);
        const entries=await readdir(dir,{withFileTypes:true});
        for(const entry of entries) {
          if(entry.isSymbolicLink() || ignored.has(entry.name) || isOfficeTemporary(entry.name) || entry.name==='.gpt-commenter-build'){omitted++;continue;}
          const path=prefix?`${prefix}/${entry.name}`:entry.name;
          if(entry.isDirectory()){folders.push(path);await walk(resolve(dir,entry.name),path,depth+1);}
          else if(entry.isFile()){const info=await stat(resolve(dir,entry.name)).catch(()=>null);if(info)files.push({name:entry.name,lastModified:info.mtimeMs,webkitRelativePath:`${basename(root)}/${path}`});}
        }
      }
      await walk(root);const tree=buildProject(files);tree.root.name=basename(root);
      for(const path of folders){let parent=tree.root,prefix='';for(const name of path.split('/')){prefix=prefix?prefix+'/'+name:name;let child=parent.children.find(n=>n.type==='directory' && n.name===name);if(!child){child={type:'directory',name,path:prefix,children:[]};parent.children.push(child);}parent=child;}}
      const sort=node=>{node.children.sort((a,b)=>(a.type===b.type?0:a.type==='directory'?-1:1)||a.name.localeCompare(b.name));node.children.filter(n=>n.type==='directory').forEach(sort);};sort(tree.root);
      const changes=await gitTreeChanges(root);applyGitTree(tree.root,changes);
      const timestamps=node=>{if(node.children)node.modified=Math.max(directoryTimes.get(node.path)||0,...node.children.map(timestamps));return node.modified||0;};timestamps(tree.root);
      if(folderPath!==undefined)connected.add(root);
      return {root:tree.root,rootPath:root,git:changes!==null,omitted:omitted+tree.omitted};
    },
    async read(root,path,ifNoneMatch) {
      await roots();
      const target=await inside(root,path),info=await stat(target);
      if(!info.isFile() || info.size>fileLimit(path))throw Error('File exceeds the preview limit (5 MB for text, 20 MB for images and Word documents).');
      const etag=fileVersion(info);
      if(ifNoneMatch===etag)return {name:path,etag,notModified:true};
      return {name:path,...fileContent(path,await readFile(target)),etag};
    },
    async create(root,folder,name,kind='file') {
      await roots();
      if(!allowed.includes(root) && !connected.has(root))throw Error('Open a project folder before creating files or folders.');
      if(!name.trim() || name==='.' || name==='..' || /[\\/\0]/.test(name) || ignored.has(name))throw Error('Enter a valid file or folder name.');
      if(!['file','directory'].includes(kind) || isAbsolute(folder) || folder.split('/').includes('..'))throw Error('Choose a folder inside the project.');
      const parent=await inside(root,folder || '.');if(!(await stat(parent)).isDirectory())throw Error('Choose a folder.');
      const target=join(parent,name);
      try{if(kind==='directory')await mkdir(target);else{const handle=await open(target,'wx');await handle.close();}}
      catch(error){if(error.code==='EEXIST')throw Error('A file or folder with that name already exists.');throw error;}
      return {path:relative(root,target),kind};
    },
    async addImage(root,folder,mime,data) {
      await roots();
      if(!allowed.includes(root) && !connected.has(root))throw Error('Open a project folder before pasting an image.');
      const extensions={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'};
      const ext=extensions[mime];if(!ext || typeof data!=='string' || data.length>28*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Paste a PNG, JPEG, GIF, or WebP image under 20 MB.');
      const bytes=Buffer.from(data,'base64');
      if(bytes.length>20*1024*1024 || !({'image/png':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/jpeg':bytes[0]===255 && bytes[1]===216 && bytes[2]===255,'image/gif':bytes.subarray(0,3).toString()==='GIF','image/webp':bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP'})[mime])throw Error('The clipboard image data is invalid or too large.');
      const parent=await inside(root,folder || '.');if(!(await stat(parent)).isDirectory())throw Error('Choose a project folder.');
      const name=`pasted-image-${randomUUID()}.${ext}`,target=join(parent,name);
      const handle=await open(target,'wx');try{await handle.writeFile(bytes);}finally{await handle.close();}
      return {path:relative(root,target),name};
    },
    async rename(root,path,name) {
      await roots();
      if(!allowed.includes(root) && !connected.has(root))throw Error('Open a project folder before renaming.');
      if(!name.trim() || name==='.' || name==='..' || /[\\/\0]/.test(name) || ignored.has(name))throw Error('Enter a valid file or folder name.');
      if(!path || isAbsolute(path) || path.split('/').includes('..'))throw Error('Rename only files or folders inside the project.');
      const source=await inside(root,path),info=await lstat(source);
      if(source!==resolve(root,path) || source===root || (!info.isFile() && !info.isDirectory()))throw Error('Choose a regular file or folder.');
      const target=join(dirname(source),name),next=relative(root,target);
      if(source===target)return {path:next};
      try{
        if(info.isDirectory()){
          // Reserve an empty destination exclusively: never replace an existing folder.
          await mkdir(target);
          try{await rename(source,target);}catch(error){await rmdir(target).catch(()=>{});throw error;}
        }else{
          await link(source,target);
          try{await unlink(source);}catch(error){await unlink(target).catch(()=>{});throw error;}
        }
      }catch(error){if(error.code==='EEXIST')throw Error('A file or folder with that name already exists.');throw error;}
      return {path:next};
    },
    async move(root,path,folder) {
      await roots();
      if(!allowed.includes(root) && !connected.has(root))throw Error('Open a project folder before moving files.');
      if(isAbsolute(path) || isAbsolute(folder) || [...path.split('/'),...folder.split('/')].includes('..'))throw Error('Move files only within the current project.');
      const source=await inside(root,path),directory=await inside(root,folder || '.');
      if(source!==resolve(root,path) || directory!==resolve(root,folder || '.') || !(await lstat(source)).isFile() || !(await stat(directory)).isDirectory())throw Error('Choose a regular file and a project folder.');
      const target=join(directory,basename(source)),next=relative(root,target);
      if(source===target)return {path:next};
      // link fails atomically on an existing destination; never overwrite a file.
      try{await link(source,target);}catch(error){if(error.code==='EEXIST')throw Error('A file with this name already exists in the destination folder.');if(error.code==='EXDEV')throw Error('Moving between different filesystems is not supported.');throw error;}
      try{await unlink(source);}catch(error){await unlink(target).catch(()=>{});throw error;}
      return {path:next};
    },
    async save(root,path,text,expectedEtag) {
      await roots();
      if(!isSupportedText(path))throw Error('This file type is not supported as text.');
      if(typeof text!=='string' || Buffer.byteLength(text)>5*1024*1024 || text.includes('\0'))throw Error('Text files must be smaller than 5 MB and contain valid text.');
      const target=await inside(root,path),before=await stat(target);
      if(!before.isFile() || before.size>5*1024*1024 || fileVersion(before)!==expectedEtag)throw Error('The file changed on disk. Save was stopped; your edits are still in the editor.');
      const bytes=await readFile(target);if(bytes.includes(0))throw Error('Binary files cannot be edited.');
      const original=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      const output=original.includes('\r\n') ? text.replace(/\r?\n/g,'\r\n') : text;
      if(Buffer.byteLength(output)>5*1024*1024)throw Error('Text files must be smaller than 5 MB.');
      const temporary=join(dirname(target),`.markdown-review-${randomUUID()}.tmp`);
      let handle;
      try {
        handle=await open(temporary,'wx',before.mode & 0o777);await handle.writeFile(output,'utf8');await handle.chmod(before.mode & 0o777);await handle.sync();await handle.close();handle=null;
        if(await inside(root,path)!==target || fileVersion(await stat(target))!==expectedEtag)throw Error('The file changed on disk. Save was stopped; your edits are still in the editor.');
        await rename(temporary,target);
      } finally {await handle?.close();await unlink(temporary).catch(()=>{});}
      return this.read(root,path);
    }
  };
}
