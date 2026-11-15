import fs from 'node:fs';
import {withoutBetaArcade} from './beta-arcade-preservation.mjs';
export function withoutArcadeTelemetry(source){return source.replace('root,{onExit,telemetry}','root,{onExit}').replace('function stopHosted(preserveSession=false){if(!preserveSession)telemetry?.close();','function stopHosted(){').replace('function launch(game,retry=false){\n  stopHosted(retry);','function launch(game){\n  stopHosted();').replace("onclick=()=>launch(game,true);","onclick=()=>launch(game);").replace('if(!retry)telemetry?.open(game.id);','');}
// Only the explicitly authorized owner-verified Tunnel Rush addition is removed
// when comparing against historical checkpoints. Other changes remain failures.
export function withoutTunnel(file,source){
 source=withoutBetaArcade(file,source);
 if(!['public/arcade/art/sprint-cover.svg','public/web-edition.js','public/arcade/catalog.json','proxy-public/arcade/catalog.json','public/arcade/art/SOURCES.json','public/arcade/ui.mjs','public/arcade/arcade.css','proxy-public/arcade/host.mjs','server.mjs'].includes(file))return source;
 source=source.toString();
 if(file==='public/arcade/art/sprint-cover.svg')return fs.readFileSync(new URL('./fixtures/stage83-sprint-cover.svg',import.meta.url));
 if(file==='public/web-edition.js')return source.replace("if(entry){clearTimeout(entry.timer);entry.element.remove();webFrames.delete(current);}","if(entry){entry.element.remove();webFrames.delete(current);}");
 // Stage 8.4 owner-requested removal of the shell-only footer (publisher notices unchanged).
 if(file==='public/arcade/ui.mjs')source=source.replace('</div></div><div id="game-area" hidden>', '<p class="arcade-credit">Game credits and controls are available in each player. Publisher services may require an internet connection.</p></div></div><div id="game-area" hidden>');
 // Stage 8.3 owner-authorized All Games transition and selected-state repair.
 if(file==='public/arcade/ui.mjs')source=source.replace(/  \/\/ BEGIN ALL GAMES STATE SYNC\n[\s\S]*?  \/\/ END ALL GAMES STATE SYNC\n/,'').replace(/category=name;\n  \/\/ BEGIN ALL GAMES RESET\n[\s\S]*?  \/\/ END ALL GAMES RESET\n  root/,'category=name;root');
 if(file.endsWith('/catalog.json'))return JSON.stringify(JSON.parse(source).filter(g=>g.id!=='tunnel-rush'),null,2)+'\n';
 if(file==='public/arcade/art/SOURCES.json')return JSON.stringify(JSON.parse(source).filter(g=>g.game!=='Tunnel Rush').map(g=>g.game==='Saurabh’s Sprint'?JSON.parse(fs.readFileSync(new URL('./fixtures/stage83-sprint-art.json',import.meta.url),'utf8')):g),null,2)+'\n';
 source=source.replace(/^[ \t]*\/\/ BEGIN TUNNEL[^\n]*\n[\s\S]*?^[ \t]*\/\/ END TUNNEL[^\n]*\n/gm,'').replace(/\n\/\* BEGIN TUNNEL LARGE PLAYER \*\/[\s\S]*?\/\* END TUNNEL LARGE PLAYER \*\/\n/,'');
 if(file==='proxy-public/arcade/host.mjs')source=source.replace('}else if(!unity)child.src=url.href;','}else child.src=url.href;').replace("(game.type==='local'||game.type==='unity-local')?'allow-scripts","game.type==='local'?'allow-scripts").replace("child.onload=()=>{if(game.type==='unity-local')return;","child.onload=()=>{");
 if(file==='server.mjs')source=source.replace("localUnityDirectory:path.join(root,'local-games/tunnel-rush'),",'');
 return source;
}
