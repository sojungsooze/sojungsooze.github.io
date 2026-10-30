import {cloudConfig} from './config.js';
import {PortfolioCloud,createBrowserGateway,validateConfig,friendlyError,imageInfo,signedDocument} from './cloud.js';
import {canonical,normalizeDocument,validateDocument,youtubeId,attachMedia,moveStill,captionKey} from './model.js';
import {DraftCache,restoreDraft} from './drafts.js';

// Reading the initial local document never writes to Supabase. The regular Save
// button is the only writer, using the existing revision-checked portfolio_save.
export async function loadInitialDocument(snapshot,{fetcher=fetch}={}){
  const current=normalizeDocument(snapshot.document);
  if(snapshot.initialized!==false||snapshot.revision!==0||current.projects.length||current.filterCategories.length)throw new Error('이미 등록된 내용이 있어요. 새로고침 후 확인해 주세요.');
  const response=await fetcher(new URL('../data/portfolio-content.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('기존 프로젝트를 불러오지 못했어요. 새로고침해 주세요.');
  const text=await response.text();if(text.length>2*1024*1024)throw new Error('기존 프로젝트 파일을 확인해 주세요.');
  const document=normalizeDocument(JSON.parse(text.replace(/^\uFEFF/,''))),errors=validateDocument(document);
  if(errors.length||!document.projects.length)throw new Error('기존 프로젝트 파일을 확인해 주세요.');
  return document;
}

// Keep provider details out of the editing flow; validation still runs in full.
function userMessage(error,fallback='잠시 후 다시 시도해 주세요.'){
  const text=error?.message||String(error),code=error?.code;
  if(/PORTFOLIO_CONFLICT|40001/.test(text)||code==='40001')return '다른 곳에서 수정한 내용이 있어요. 새로고침 후 확인해 주세요.';
  if(/invalid login credentials/i.test(text))return '이메일 또는 비밀번호를 확인해 주세요.';
  if(/42501|administrator access|row.level|not authorized|permission denied/i.test(text)||code==='42501')return '관리자 계정으로 다시 로그인해 주세요.';
  if(/Failed to fetch|NetworkError|fetch failed|timeout|aborted/i.test(text))return '인터넷 연결을 확인하고 다시 시도해 주세요.';
  const friendly=friendlyError(error);
  return /[가-힣]/.test(friendly)&&!/Supabase|Storage|RPC|SQL|JWT|portfolio_|schema|column|relation|token/i.test(friendly)?friendly:fallback;
}

export class AdminApp {
  constructor({document:dom=document,preview=false,cloud=null,gateway=null,user=null,cache=null,publicActive=false,initialDocumentLoader=loadInitialDocument}={}){
    this.dom=dom;this.preview=preview;this.cloud=cloud;this.gateway=gateway;this.user=user;this.cache=cache;this.publicActive=publicActive;
    this.initialDocumentLoader=initialDocumentLoader;
    this.doc=null;this.revision=0;this.dirty=false;this.busy=false;this.processing=0;this.editing=null;this.signed=new Map();this.urls=new Map();this.draftTimer=null;this.restoreRecord=null;
    this.q=selector=>dom.querySelector(selector);this.view=this.q('#view');
    dom.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',()=>this.save()));
    this.q('#restore-draft').addEventListener('click',()=>this.restore());this.q('#dismiss-draft').addEventListener('click',async()=>{this.restoreRecord=null;this.q('#draft-notice').hidden=true;try{if(this.dirty)await this.cache?.save(this.doc,this.revision);else await this.cache?.clear();}catch{/* Optional recovery only. */}});
  }
  el(tag,text,cls){const n=this.dom.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  button(text,action,cls){const b=this.el('button',text,cls);b.type='button';b.addEventListener('click',action);return b;}
  status(text,type=''){const p=this.q('#save-status');p.textContent=text;p.className='status '+type;}
  updateButtons(){this.dom.querySelectorAll('[data-save]').forEach(b=>{b.disabled=this.preview||this.busy||this.processing>0||!this.doc||!this.dirty;b.textContent=this.busy?'저장 중…':'저장하기';b.setAttribute('aria-busy',String(this.busy));});this.q('#logout').disabled=this.busy||this.processing>0;this.view.inert=this.busy||this.processing>0;this.q('#draft-notice').inert=this.busy||this.processing>0;}
  setBusy(busy){this.busy=busy;this.view.inert=busy;this.q('#draft-notice').inert=busy;this.q('#logout').disabled=busy;this.updateButtons();}
  changed(){this.dirty=true;this.updateButtons();if(this.preview){this.status('화면 미리보기 · 수정 내용은 저장되지 않아요.');return;}
    this.status('수정한 내용이 있어요. 저장하기를 눌러 주세요.');clearTimeout(this.draftTimer);
    this.draftTimer=setTimeout(()=>this.cache?.save(this.doc,this.revision).catch(()=>this.status('이 브라우저에는 임시보관할 수 없어요. 화면을 닫기 전에 저장해 주세요.')),600);
  }
  async load(snapshot){
    const firstSave=!this.preview&&snapshot.initialized===false;
    // Fail closed if either the local source or the supposedly empty server is invalid.
    this.doc=null;this.updateButtons();
    const document=firstSave?await this.initialDocumentLoader(snapshot):normalizeDocument(snapshot.document);
    this.revision=snapshot.revision;this.doc=document;this.dirty=firstSave;await this.refreshSigned();this.renderList();
    this.q('#login').hidden=true;this.q('#workspace').hidden=false;
    if(this.preview)this.status('화면 미리보기 · 수정 내용은 저장되지 않아요.');
    else if(firstSave)this.status('기존 '+this.doc.projects.length+'개 프로젝트를 불러왔어요. 저장하기를 누르면 처음 등록됩니다.');
    else this.status('저장한 내용을 불러왔습니다.');this.updateButtons();
    if(this.cache&&this.doc){try{const draft=await this.cache.load();if(draft&&(draft.images?.length||canonical(draft.document)!==canonical(this.doc))){this.restoreRecord=draft;this.q('#draft-notice').hidden=false;}}catch{/* Saving online remains available when optional local cache fails. */}}
  }
  async refreshSigned(){if(!this.gateway||!this.doc)return;try{const signed=await signedDocument(this.doc,this.gateway);this.doc.projects.forEach((p,i)=>{const next=signed.projects[i];if(p.thumbnail)this.signed.set(p.thumbnail,next.thumbnail);(p.stills||[]).forEach((f,j)=>{if(f.image)this.signed.set(f.image,next.stills[j].image);});});}catch(error){this.status(userMessage(error,'저장된 이미지를 불러오지 못했어요.'),'error');}}
  revoke(){for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();}
  discardMedia(target,thumbnail=false){const key=thumbnail?'_thumbnailMedia':'_media',record=target[key],url=this.urls.get(record);if(url){URL.revokeObjectURL(url);this.urls.delete(record);}delete target[key];}
  mediaURL(value,record){if(record?.file){if(!this.urls.has(record))this.urls.set(record,URL.createObjectURL(record.file));return this.urls.get(record);}
    if(!value)return '';if(value.startsWith('storage:'))return this.signed.get(value)||'';return value.startsWith('assets/')?new URL('../'+value,location.href).href:value;}
  imageBox(value,record,project=null,stillIndex=null){const box=this.el('div',undefined,stillIndex===null?'project-cover':'still-preview');if(stillIndex!==null)box.style.background=['#f3e7e2','#e5eaf1','#e9eddf','#eee5f1'][stillIndex];
    const placeholder=this.el('span',stillIndex===null?'VIDEO PROJECT':'STILL '+String(stillIndex+1).padStart(2,'0'));box.append(placeholder);
    const direct=this.mediaURL(value,record),id=project&&youtubeId(project.url),candidates=[];
    if(direct)candidates.push({url:direct,min:1});if(stillIndex===null&&id)for(const [name,min] of [['maxresdefault',1280],['sddefault',640],['hqdefault',480]])candidates.push({url:'https://i.ytimg.com/vi/'+id+'/'+name+'.jpg',min});
    const load=()=>{const candidate=candidates.shift();if(!candidate)return;const image=this.el('img');image.alt=stillIndex===null?(project?.title||'프로젝트 썸네일'):(record?.alt||'상세 이미지');image.onload=()=>{if(image.naturalWidth<candidate.min){load();return;}box.replaceChildren(image);};image.onerror=load;image.src=candidate.url;};load();return box;
  }
  field(parent,label,value,change,{area=false,max=6000,placeholder='',type='text'}={}){const wrapper=this.el('label',label,'field'),input=this.el(area?'textarea':'input');if(!area)input.type=type;input.value=value||'';input.maxLength=max;input.placeholder=placeholder;input.addEventListener('input',()=>{change(input.value);this.changed();});wrapper.append(input);parent.append(wrapper);return input;}
  async selectImage(target,thumbnail,refresh,onSelected=()=>{}){
    const input=this.el('input');input.type='file';input.accept='.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';input.hidden=true;
    input.addEventListener('cancel',()=>input.remove(),{once:true});
    input.addEventListener('change',async()=>{const file=input.files?.[0];input.remove();if(!file)return;this.processing++;this.updateButtons();
      try{await imageInfo(file);const test=this.el('img'),url=URL.createObjectURL(file);
        try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('이미지를 읽지 못했습니다. 다른 파일을 선택하세요.')),15000);test.onload=()=>{clearTimeout(timer);test.naturalWidth?resolve():reject(new Error('이미지 해상도를 읽지 못했습니다.'));};test.onerror=()=>{clearTimeout(timer);reject(new Error('읽을 수 없는 이미지입니다.'));};test.src=url;});}finally{URL.revokeObjectURL(url);}
        this.discardMedia(target,thumbnail);attachMedia(target,{file},thumbnail);onSelected();this.changed();refresh();
      }catch(error){this.status(userMessage(error,'이미지를 읽지 못했어요. 다른 파일을 선택해 주세요.'),'error');}finally{this.processing--;this.updateButtons();}
    },{once:true});this.view.append(input);input.click();
  }
  renderList(){
    this.revoke();this.editing=null;this.q('#page-title').textContent='프로젝트 목록';this.view.replaceChildren();
    const bar=this.el('div',undefined,'list-actions');
    bar.append(this.el('span',this.doc.projects.length+'개의 프로젝트','muted'),this.button('+ 프로젝트 추가',()=>this.addProject(),'primary'));
    this.view.append(bar);
    const grid=this.el('div',undefined,'project-grid');this.view.append(grid);
    if(!this.doc.projects.length)grid.append(this.el('p','프로젝트를 추가해 보세요.','empty'));
    this.doc.projects.forEach((p,i)=>{
      const card=this.el('article',undefined,'project-card');card.dataset.projectId=p.id;
      card.append(this.imageBox(p.thumbnail,p._thumbnailMedia,p));
      const content=this.el('div',undefined,'project-content');
      content.append(this.el('p',String(i+1).padStart(2,'0')+' / '+(p.category||'PROJECT'),'eyebrow'),this.el('h2',p.title));
      const badges=this.el('div',undefined,'badges');
      badges.append(this.el('span',p.visible===false?'비공개':'공개','badge '+(p.visible===false?'':'blue')));
      p.filterCategoryIds.forEach(id=>{const c=this.doc.filterCategories.find(c=>c.id===id);if(c)badges.append(this.el('span',c.name,'badge'));});
      content.append(badges);
      const footer=this.el('div',undefined,'project-footer'),order=this.el('div',undefined,'actions'),edit=this.el('div',undefined,'actions');
      const move=delta=>{this.moveProject(p.id,delta);this.renderList();};
      const up=this.button('↑',()=>move(-1)),down=this.button('↓',()=>move(1));
      up.disabled=i===0;down.disabled=i===this.doc.projects.length-1;
      up.setAttribute('aria-label',p.title+' 순서 위로');down.setAttribute('aria-label',p.title+' 순서 아래로');order.append(up,down);
      edit.append(this.button('삭제',()=>{
        if(!confirm(p.title+' 프로젝트를 삭제할까요? 저장하기를 누르면 반영됩니다.'))return;
        this.doc.projects.splice(i,1);this.changed();this.renderList();
      },'danger'),this.button('편집',()=>this.renderEditor(p.id),'primary'));
      footer.append(order,edit);content.append(footer);card.append(content);grid.append(card);
    });this.updateButtons();
  }
  moveProject(id,delta){
    const i=this.doc.projects.findIndex(p=>p.id===id),next=i+delta;
    if(i<0||next<0||next>=this.doc.projects.length)return;
    [this.doc.projects[i],this.doc.projects[next]]=[this.doc.projects[next],this.doc.projects[i]];this.changed();
  }
  addProject(){
    const p={id:'project-'+crypto.randomUUID(),number:String(this.doc.projects.length+1).padStart(2,'0'),title:'새 프로젝트',category:'',type:'',role:'',tools:'',summary:'',url:'',videoFile:'',previewFile:'',thumbnail:'',points:[],stills:[],filterCategoryIds:[],visible:false};
    this.doc.projects.push(p);this.changed();this.renderEditor(p.id);
  }
  renderEditor(id){
    this.revoke();const p=this.doc.projects.find(p=>p.id===id);if(!p)return this.renderList();
    this.editing=id;this.q('#page-title').textContent='프로젝트 편집';this.view.replaceChildren();
    const back=this.el('div',undefined,'editor-actions');back.append(this.button('← 프로젝트 목록',()=>this.renderList()));this.view.append(back);
    const form=this.el('form');form.addEventListener('submit',event=>{event.preventDefault();this.save();});this.view.append(form);
    const section=title=>{const s=this.el('section',undefined,'editor-section');s.append(this.el('h2',title));form.append(s);return s;};
    const details=section('프로젝트 정보'),grid=this.el('div',undefined,'form-grid');details.append(grid);
    this.field(grid,'프로젝트 제목',p.title,value=>{p.title=value;},{max:160}).required=true;
    this.field(grid,'카테고리',p.category,value=>{p.category=value;},{max:160,placeholder:'예: TRAVEL VLOG · STORYTELLING'});
    const choices=this.el('div',undefined,'filter-checks');choices.setAttribute('role','group');choices.setAttribute('aria-label','목록에서 표시할 카테고리');
    this.doc.filterCategories.forEach(c=>{
      const label=this.el('label',undefined,'check'),input=this.el('input');input.type='checkbox';input.checked=p.filterCategoryIds.includes(c.id);
      input.addEventListener('change',()=>{p.filterCategoryIds=input.checked?[...p.filterCategoryIds,c.id]:p.filterCategoryIds.filter(id=>id!==c.id);this.changed();});
      label.append(input,this.el('span',c.name));choices.append(label);
    });
    details.append(this.el('p','목록 분류','field-label'),choices);
    const metadata=this.el('div',undefined,'form-grid');details.append(metadata);
    for(const [key,label,max] of [['type','프로젝트 유형',200],['role','작업 역할',300],['tools','사용 툴',300]])this.field(metadata,label,p[key],value=>{p[key]=value;},{max});
    const descriptionKey=p.description!==undefined?'description':'summary';
    this.field(details,'프로젝트 설명',p[descriptionKey],value=>{p[descriptionKey]=value;},{area:true});
    const media=section('YouTube와 대표 썸네일'),layout=this.el('div',undefined,'media-editor'),inputs=this.el('div'),imageSide=this.el('div');
    layout.append(inputs,imageSide);media.append(layout);
    const drawThumbnail=()=>imageSide.replaceChildren(this.imageBox(p.thumbnail,p._thumbnailMedia,p));
    this.field(inputs,'YouTube URL',p.url,value=>{p.url=value.trim();drawThumbnail();},{type:'url',placeholder:'https://www.youtube.com/watch?v=...'});
    const actions=this.el('div',undefined,'actions');
    actions.append(this.button('썸네일 선택',()=>this.selectImage(p,true,drawThumbnail)),this.button('YouTube 썸네일 사용',()=>{this.discardMedia(p,true);p.thumbnail='';this.changed();drawThumbnail();}));
    inputs.append(this.el('p','썸네일을 선택하지 않으면 YouTube 고화질 이미지를 사용해요.','help'),actions,this.el('p','PNG · JPG · WebP / 15MB 이하','help'));drawThumbnail();
    const points=section('STORY / CUT / CAPTION'),pointsGrid=this.el('div',undefined,'points-grid');points.append(pointsGrid);
    ['STORY','CUT','CAPTION'].forEach((label,i)=>this.field(pointsGrid,label,p.points?.[i]?.[1]||'',value=>{
      p.points||=[];while(p.points.length<=i)p.points.push([['01 / STORY','02 / CUT','03 / CAPTION'][p.points.length],'']);p.points[i][1]=value;
    },{area:true}));
    const stills=section('STILL 01–04'),stillGrid=this.el('div',undefined,'still-grid');stills.append(stillGrid);
    // Empty slots are view-only until edited, preserving legacy fields and arrays.
    const commitFrame=(i,frame)=>{p.stills||=[];while(p.stills.length<=i)p.stills.push({image:''});p.stills[i]=frame;};
    const drawStills=()=>{
      stillGrid.replaceChildren();
      Array.from({length:4},(_,i)=>p.stills?.[i]||{image:''}).forEach((frame,i)=>{
        const card=this.el('article',undefined,'still-card');card.dataset.still=String(i+1);const number=String(i+1).padStart(2,'0');
        card.append(this.el('h3','STILL '+number),this.imageBox(frame.image,frame._media,null,i));
        const imageActions=this.el('div',undefined,'actions');
        imageActions.append(this.button(frame.image||frame._media?'이미지 바꾸기':'이미지 선택',()=>this.selectImage(frame,false,drawStills,()=>commitFrame(i,frame))),this.button('이미지 지우기',()=>{
          if(!frame.image&&!frame._media)return;this.discardMedia(frame);frame.image='';commitFrame(i,frame);this.changed();drawStills();
        }));card.append(imageActions);
        if(frame._media)card.append(this.el('p','선택한 이미지 · 저장 전','image-state'));
        const title=this.field(card,'제목',frame.title,value=>{frame.title=value;commitFrame(i,frame);},{max:120,placeholder:'장면 제목'});title.setAttribute('aria-label','STILL '+number+' 제목');
        const key=captionKey(frame),description=this.field(card,'설명',frame[key],value=>{frame[key]=value;commitFrame(i,frame);},{area:true,max:300,placeholder:'이 장면의 작업 내용을 적어 주세요.'});description.setAttribute('aria-label','STILL '+number+' 설명');
        const startTime=this.field(card,'영상 시작 시간',frame.startTime,value=>{frame.startTime=value.trim();commitFrame(i,frame);},{max:16,placeholder:'02:35, 14:10, 01:02:30'});startTime.setAttribute('aria-label','STILL '+number+' 영상 시작 시간');
        const order=this.el('div',undefined,'order-actions');const move=delta=>{
          p.stills||=[];while(p.stills.length<4)p.stills.push({image:''});moveStill(p,i,delta);this.changed();drawStills();
        };
        const up=this.button('↑ 위로',()=>move(-1)),down=this.button('↓ 아래로',()=>move(1));up.disabled=i===0;down.disabled=i===3;
        up.setAttribute('aria-label','STILL '+number+' 순서 위로');down.setAttribute('aria-label','STILL '+number+' 순서 아래로');order.append(up,down);card.append(order);stillGrid.append(card);
      });
    };drawStills();
    const publishing=section('공개 설정'),visible=this.el('label',undefined,'check'),check=this.el('input');check.type='checkbox';check.checked=p.visible!==false;
    check.addEventListener('change',()=>{p.visible=check.checked;this.changed();});visible.append(check,this.el('span','공개 포트폴리오에 표시'));publishing.append(visible);
    const order=this.el('div',undefined,'project-order'),index=this.doc.projects.indexOf(p),up=this.button('↑ 위로',()=>{this.moveProject(id,-1);this.renderEditor(id);}),down=this.button('↓ 아래로',()=>{this.moveProject(id,1);this.renderEditor(id);});
    up.disabled=index===0;down.disabled=index===this.doc.projects.length-1;up.setAttribute('aria-label','프로젝트 순서 위로');down.setAttribute('aria-label','프로젝트 순서 아래로');
    order.append(this.el('span','프로젝트 순서 '+(index+1)+' / '+this.doc.projects.length,'muted'),up,down);publishing.append(order);this.updateButtons();
  }
  async save(){if(this.preview){this.status('화면 미리보기 · 수정 내용은 저장되지 않아요.');return false;}if(this.busy||this.processing||!this.doc)return false;
    if(!this.cloud){this.status('저장 연결을 준비 중이에요.','error');return false;}
    const errors=validateDocument(this.doc);if(errors.length){this.status(errors[0],'error');return false;}clearTimeout(this.draftTimer);this.setBusy(true);this.status('저장 중…');
    try{try{await this.cache?.save(this.doc,this.revision);}catch{/* Optional cache only. */}
      const saved=await this.cloud.save(this.doc,this.revision,()=>this.status('저장 중…'));
      if(saved?.verified!==true)throw new Error('저장 확인을 마치지 못했어요. 다시 시도해 주세요.');
      this.doc=saved.document;this.revision=saved.revision;this.dirty=false;await this.refreshSigned();try{await this.cache?.clear();}catch{/* Old revision will never auto-restore. */}
      this.restoreRecord=null;this.q('#draft-notice').hidden=true;
      if(this.editing)this.renderEditor(this.editing);else this.renderList();
      this.status(this.publicActive?'저장했어요. 공개 포트폴리오에 반영됐어요.':'저장했어요. 공개 사이트 연결은 준비 중이에요.','success');return true;
    }catch(error){
      const stages={'image-validation':'이미지 확인','image-upload':'이미지 업로드','image-readback':'업로드 이미지 확인','media-register':'이미지 등록','save-rpc':'내용 저장','save-response':'저장 응답 확인','admin-readback':'저장 내용 확인','public-readback':'공개 내용 확인','image-urls':'이미지 주소 확인','public-image-readback':'공개 이미지 확인'};
      const code=/^[A-Za-z0-9_-]{1,32}$/.test(error.code||'')?error.code:'';
      const detail=error.databaseSaved?'서버 저장 응답은 받았지만 확인이 끝나지 않았어요.':stages[error.saveStage]?stages[error.saveStage]+' 단계에서 멈췄어요.':'';
      this.status('저장을 확인하지 못했어요. '+detail+' '+userMessage(error)+(code?' ('+code+')':'')+' 수정 내용은 그대로 있어요.','error');
      if(error.saveStage)console.warn('Portfolio save failed',{stage:error.saveStage,code:code||'UNKNOWN',databaseSaved:error.databaseSaved,adminVerified:error.adminVerified});
      try{await this.cache?.save(this.doc,this.revision);}catch{}return false;
    }
    finally{this.setBusy(false);}
  }
  async restore(){if(this.busy||this.processing)return;try{const record=this.restoreRecord;if(!record)return;if(record.revision!==this.revision&&!confirm('다른 곳에서 저장한 내용과 달라요. 이전 수정 내용을 불러올까요?'))return;const restored=restoreDraft(record),errors=validateDocument(restored);if(errors.length)throw new Error(errors[0]);this.doc=restored;this.revision=record.revision;this.restoreRecord=null;this.q('#draft-notice').hidden=true;this.changed();await this.refreshSigned();this.renderList();}catch(error){this.status(userMessage(error),'error');}}
  dispose(){clearTimeout(this.draftTimer);this.revoke();}
}

export async function bootstrap({config=cloudConfig,gateway:providedGateway=null}={}){
  const dom=document,preview=dom.body.dataset.preview==='true',status=dom.querySelector('#login-status');let app=null;
  if(preview){const response=await fetch(new URL('../data/portfolio-content.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('현재 프로젝트를 읽을 수 없습니다.');app=new AdminApp({document:dom,preview:true});await app.load({revision:0,initialized:true,document:normalizeDocument(await response.json())});return app;}
  let gateway;try{validateConfig(config);gateway=providedGateway||await createBrowserGateway(config);}catch(error){status.textContent=userMessage(error,'로그인 연결을 준비 중이에요.');return null;}
  const cloud=new PortfolioCloud(config,gateway),login=dom.querySelector('#login-button');login.disabled=false;status.textContent='관리자 계정으로 로그인하세요.';
  let opening=false;
  const open=async()=>{if(opening||app?.busy)return;opening=true;try{const {data,error}=await gateway.auth.getUser();if(error||!data.user)return;
    const snapshot=await cloud.readAdmin();let publicActive=false;
    try{const response=await fetch(new URL('./public-activation.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(2000)});if(response.ok){const state=await response.json();publicActive=state.enabled===true&&state.projectUrl===config.projectUrl&&state.schemaVersion===1;}}catch{/* Cloud persistence is separate from activating this static site. */}
    app?.dispose();app=new AdminApp({document:dom,cloud,gateway,user:data.user,publicActive,cache:new DraftCache(config.projectUrl+'|'+data.user.id)});dom.querySelector('#account').textContent=data.user.email;dom.querySelector('#logout').hidden=false;await app.load(snapshot);
  }catch(error){status.textContent=userMessage(error,'프로젝트를 불러오지 못했어요. 잠시 후 다시 로그인해 주세요.');status.classList.add('error');}finally{opening=false;}};
  dom.querySelector('#login-form').addEventListener('submit',async event=>{event.preventDefault();if(login.disabled)return;login.disabled=true;login.textContent='로그인 중...';const form=event.currentTarget;
    try{const {error}=await gateway.auth.signInWithPassword({email:form.elements.namedItem('email').value.trim(),password:form.elements.namedItem('password').value});if(error)throw error;await open();}catch(error){status.textContent=userMessage(error,'로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');status.classList.add('error');}finally{form.elements.namedItem('password').value='';login.disabled=false;login.textContent='로그인';}
  });
  dom.querySelector('#logout').addEventListener('click',async()=>{if(app?.busy||app?.processing)return;if(app?.dirty&&!confirm('저장하지 않은 편집 내용이 있어요. 로그아웃할까요?'))return;const {error}=await gateway.auth.signOut({scope:'local'});if(error){app?.status(userMessage(error),'error');return;}app?.dispose();app=null;dom.querySelector('#workspace').hidden=true;dom.querySelector('#login').hidden=false;dom.querySelector('#account').textContent='';dom.querySelector('#logout').hidden=true;dom.querySelector('#view').replaceChildren();dom.querySelector('#draft-notice').hidden=true;});
  gateway.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){app?.dispose();app=null;dom.querySelector('#workspace').hidden=true;dom.querySelector('#login').hidden=false;dom.querySelector('#logout').hidden=true;dom.querySelector('#view').replaceChildren();dom.querySelector('#draft-notice').hidden=true;}if(event==='TOKEN_REFRESHED')status.classList.remove('error');});
  window.addEventListener('beforeunload',event=>{if(app?.busy||app?.dirty){event.preventDefault();event.returnValue='';}});window.addEventListener('pagehide',()=>{if(app?.dirty)app.cache?.save(app.doc,app.revision).catch(()=>{});});
  await open();return app;
}
if(typeof document!=='undefined')bootstrap().catch(error=>{const status=document.querySelector('#login-status')||document.querySelector('#save-status');if(status){status.textContent=userMessage(error,'화면을 불러오지 못했어요. 새로고침해 주세요.');status.classList.add('error');}});
