import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
const execute=promisify(execFile);
export async function trashProjectEntry(workspace,root,path,{platform=process.platform,run=execute}={}){
 if(platform!=='darwin')throw Error('Move to Trash is available on macOS only.');
 if(!path || isAbsolute(path) || path.split(/[\\/]/).some(part=>part==='..'))throw Error('Choose a file or folder inside the project.');
 if(!await workspace.sourceDiscoveryAllowed(root))throw Error('Open a project folder before deleting.');
 const target=await workspace.resolve(root,path),info=await lstat(target);
 if(target===root || target!==resolve(root,path) || (!info.isFile() && !info.isDirectory()))throw Error('Choose a regular file or folder.');
 // Pass the path as an argument; filenames are never evaluated as AppleScript.
 await run('/usr/bin/osascript',['-e','on run argv\n set targetItem to (POSIX file (item 1 of argv)) as alias\n tell application "Finder" to delete targetItem\nend run',target],{timeout:30000,maxBuffer:8192});
 return {deleted:true,path};
}
