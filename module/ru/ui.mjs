import { russianDocument } from './naming.mjs';
import {displayName, canonicalName, clanDocuments} from './content.mjs';
import {translateText, lexicon} from './lexicon.mjs';

export function translateRoot(root, {actorName=null}={}) {
  if(!root?.querySelectorAll) return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const skip='script,style,textarea,[contenteditable="true"],.bio-body,.editor-content,.journal-entry-content,.chat-message .message-sender';
  let node;
  while((node=walker.nextNode())) {
    if(node.parentElement?.closest(skip)) continue;
    const value=node.nodeValue,trim=value.trim();
    if(!trim||trim===actorName) continue;
    const exact=lexicon[trim] || displayName(trim);
    const tr=exact!==trim?value.replace(trim,exact):translateText(value);
    if(tr!==value) node.nodeValue=tr;
  }
  for(const el of root.querySelectorAll('[title],[placeholder],[aria-label]')) for(const attr of ['title','placeholder','aria-label']) {
    const value=el.getAttribute(attr);if(!value||value===actorName)continue;
    const tr=translateText(value);if(tr!==value)el.setAttribute(attr,tr);
  }
  // Presentation uses Russian; preUpdate hooks restore recognized canonical keys.
  for(const input of root.querySelectorAll('input[type="text"]')) {
    if(input.name==='name'&&actorName) continue;
    if(input.name==='name'||/system\.(powers|levels)\..*\.name$/.test(input.name)) {
      const tr=displayName(input.value);if(tr!==input.value)input.value=tr;
    }
  }
}
const observers=new WeakMap();
function localizeApplication(app,html) {
  const root=html?.querySelectorAll?html:html?.[0];if(!root)return;
  const isSystem=app?.options?.classes?.includes?.('vtm-v20')||root.closest?.('.vtm-v20')||root.matches?.('.vtm-v20')||root.querySelector('.vtm-v20')||app?.document?.pack?.startsWith('vtm-v20.')||app?.collection?.collection?.startsWith('vtm-v20.')||/compendium|settings-config/.test(root.id||'');
  if(!isSystem)return;
  const actorName=app?.document?.documentName==='Actor'?app.document.name:null;
  translateRoot(root,{actorName});
  if(!observers.has(root)) {
    let pending=false;const observer=new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;translateRoot(root,{actorName});});});
    observer.observe(root,{subtree:true,childList:true,characterData:true});observers.set(root,observer);
  }
}
function restoreItemKeys(doc,changes) {
  if(changes.name)changes.name=displayName(changes.name);
  for(const [key,value] of Object.entries(changes)) if(/system\.(powers|levels)\..*\.name$/.test(key))changes[key]=displayName(value);
  for(const type of ['powers','levels']) for(const power of Object.values(changes.system?.[type]||{})) if(power.name)power.name=displayName(power.name);
}
Hooks.on('preUpdateItem',restoreItemKeys);
Hooks.on('preCreateItem',(doc,data)=>{if(data.name)doc.updateSource({name:displayName(data.name)});});
Hooks.on('renderApplication',localizeApplication);
Hooks.on('renderApplicationV2',localizeApplication);
Hooks.on('renderChatMessageHTML',(message,html)=>{
  const root=html?.querySelectorAll?html:html?.[0];
  if(root?.querySelector('.vtm-roll,.vtm-combat-card,.vtm-damage-card')) translateRoot(root,{actorName:message.speaker?.alias});
});
Hooks.on('renderCompendiumDirectory',localizeApplication);
Hooks.on('renderSettingsConfig',localizeApplication);
Hooks.once('init',()=>{
  // System settings are registered later in the same init event.
  for(const method of ['info','warn','error']) {
    const original=ui.notifications[method].bind(ui.notifications);
    ui.notifications[method]=(message,...args)=>original(translateText(message),...args);
  }
});
