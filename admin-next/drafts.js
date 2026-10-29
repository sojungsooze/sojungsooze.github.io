import {clone,pendingMedia,attachMedia} from './model.js';
export class DraftCache {
  constructor(key){this.key=key;this.db=null;this.queue=Promise.resolve();}
  async open(){if(this.db)return;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sojung-admin-next-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('임시 편집 내용을 보관할 수 없습니다.'));});}
  async action(mode,action){await this.open();return new Promise((resolve,reject)=>{const tx=this.db.transaction('drafts',mode),r=action(tx.objectStore('drafts'));let result;r&&(r.onsuccess=()=>{result=r.result;});tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('임시보관이 취소됐습니다.'));});}
  load(){return this.action('readonly',s=>s.get(this.key));}
  save(document,revision){const snapshot={version:1,revision,document:clone(document),images:pendingMedia(document).map(({projectId,field,index,record})=>({projectId,field,index,record:{file:record.file,path:record.path,verified:record.verified,attempted:record.attempted}})),savedAt:new Date().toISOString()};
    this.queue=this.queue.catch(()=>{}).then(()=>this.action('readwrite',s=>s.put(snapshot,this.key)));return this.queue;
  }
  async clear(){await this.queue.catch(()=>{});return this.action('readwrite',s=>s.delete(this.key));}
}
export function restoreDraft(record){
  if(record?.version!==1||!record.document||!Array.isArray(record.images))throw new Error('보관된 편집 내용을 읽을 수 없습니다.');
  const doc=clone(record.document);for(const item of record.images){if(!(item.record?.file instanceof Blob))continue;const project=doc.projects.find(p=>p.id===item.projectId),target=item.field==='thumbnail'?project:project?.stills?.[item.index];if(target)attachMedia(target,{...item.record},item.field==='thumbnail');}return doc;
}
