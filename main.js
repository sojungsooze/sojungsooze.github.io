(async()=>{
  'use strict';
  const fallback=window.SOJUNG_PORTFOLIO_DATA;
  const loaded=await Promise.resolve(window.SOJUNG_CONTENT_READY||fallback).catch(()=>fallback);
  const normalized=loaded?window.PortfolioAdminModel.normalizeFilters(loaded):null;
  const data=normalized?{...normalized,projects:normalized.projects.filter(p=>p.visible!==false)}:null;
  if(!data){console.error('portfolio-data.js가 없습니다.');return;}
  const $=(q,root=document)=>root.querySelector(q);
  const $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const safeString=v=>String(v??'');
  const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=safeString(text);return e;};
  const locateProject=id=>data.projects.find(p=>p.id===id)||data.projects[0];
  const youtubeId=url=>{
    if(!url)return null;
    try{
      const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return null;
      const host=u.hostname.toLowerCase().replace(/^www\./,'');
      if(host==='youtu.be')return /^[-_a-zA-Z0-9]{11}$/.test(u.pathname.slice(1).split('/')[0])?u.pathname.slice(1).split('/')[0]:null;
      if(host!=='youtube.com'&&host!=='m.youtube.com'&&host!=='youtube-nocookie.com')return null;
      const path=u.pathname.split('/').filter(Boolean);
      const id=path[0]==='watch'?u.searchParams.get('v'):['shorts','live','embed'].includes(path[0])?path[1]:null;
      return /^[-_a-zA-Z0-9]{11}$/.test(id||'')?id:null;
    }catch{return null;}
  };
  const safeMediaPath=v=>{
    if(!v||typeof v!=='string')return '';
    // Local relative paths are preferred; prevent arbitrary protocols.
    if(v.startsWith('assets/')){
      try{
        const decoded=decodeURIComponent(v);
        if(!decoded.includes('..')&&!decoded.includes('\\')&&!/[\x00-\x1f]/.test(decoded))return v;
      }catch{return ''}
      return '';
    }
    try{const u=new URL(v);return u.protocol==='https:'?u.href:''}catch{return ''}
  };
  const thumbnail=p=>safeMediaPath(p.thumbnail)||(youtubeId(p.url)?`https://i.ytimg.com/vi/${youtubeId(p.url)}/maxresdefault.jpg`:'');
  const localVideo=p=>{const v=p.videoFile||'';return v.startsWith('assets/')&&!v.includes('..')?v:''};
  let selected=data.projects[0];
  // Profile content (source SVG words, kept as real editable HTML text)
  $('#profile-description').textContent=data.profile.description;
  data.profile.keywords.forEach(t=>$('#keywords').append(make('span','keyword',t)));
  const toolColors={Pr:'#00005b',Fc:'#fdfa39',Ps:'#31a8ff',Ai:'#ff9a00',Fi:'#b659ff'};
  const toolHover=window.matchMedia('(hover: hover) and (pointer: fine)');
  data.profile.tools.forEach((tool,i)=>{
    const row=make('div','skill');row.style.setProperty('--tool-delay',i*90+'ms');const icon=make('span','skill-icon',tool.short);
    icon.tabIndex=0;
    icon.setAttribute('aria-label',tool.name);
    row.style.setProperty('--tool-color',toolColors[tool.short]||'#363636');
    if(tool.short==='Fc')row.style.setProperty('--tool-ink','#202020');
    row.append(icon);
    const meter=make('div','skill-meter');const fill=make('span');fill.style.setProperty('--level',`${Math.max(0,Math.min(1,tool.progress))*100}%`);fill.style.setProperty('--meter-delay',`${i*90}ms`);meter.append(fill);row.append(meter);row.append(make('span','skill-name',tool.name));$('#skills').append(row);
    // One cancellable animation per tool. No click handler or selected state.
    let animation=null,engaged=false;
    const updateHover=()=>{
      const active=(toolHover.matches&&icon.matches(':hover'))||icon.matches(':focus-visible');
      if(active===engaged)return;
      engaged=active;
      const current=getComputedStyle(fill).width;
      if(animation){animation.cancel();animation=null;}
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||
        !row.closest('.skill-panel').classList.contains('visible')||!fill.animate)return;
      animation=fill.animate([
        {width:active?'0%':current},
        {width:fill.style.getPropertyValue('--level')}
      ],{duration:active?650:220,easing:'cubic-bezier(.22,1,.36,1)'});
    };
    ['pointerenter','pointerleave','focus','blur'].forEach(event=>icon.addEventListener(event,updateHover));
    toolHover.addEventListener('change',updateHover);
  });
  const {contact}=data;
  $('#phone-link').textContent=contact.phone;
  $('#phone-link').href=`tel:${contact.phone.replace(/[^+\d]/g,'')}`;
  $('#email-link').textContent=contact.email;
  $('#email-link').href=`mailto:${contact.email}`;
  $('#youtube-link').href=contact.youtube;

  // Work interactions keep existing project objects and DOM card order intact.
  const grid=$('#work-grid');
  const workMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const workHover=window.matchMedia('(hover: hover) and (pointer: fine)');
  const previewStops=new Map(),filterAnimations=new Set();
  let filterRevision=0,studyScrollFrame=null;
  const cancelStudyScroll=()=>{
    if(studyScrollFrame!==null)cancelAnimationFrame(studyScrollFrame);
    studyScrollFrame=null;
  };
  const focusStudy=()=>{
    const heading=$('#study-title');heading.tabIndex=-1;heading.focus({preventScroll:true});
  };
  function scrollToStudy(){
    cancelStudyScroll();
    const study=$('#study');
    if(workMotion.matches){
      study.scrollIntoView({behavior:'instant'});
      focusStudy();return;
    }
    const start=window.scrollY;
    const target=Math.max(0,Math.min(
      document.documentElement.scrollHeight-window.innerHeight,
      start+study.getBoundingClientRect().top-24
    ));
    const started=performance.now();
    const step=now=>{
      const p=Math.min(1,Math.max(0,(now-started)/600));
      window.scrollTo({top:start+(target-start)*(1-Math.pow(1-p,3)),behavior:'instant'});
      if(p<1)studyScrollFrame=requestAnimationFrame(step);
      else{studyScrollFrame=null;focusStudy();}
    };
    studyScrollFrame=requestAnimationFrame(step);
  }
  // User navigation interrupts the handoff; no scroll locking or duplicate clicks.
  window.addEventListener('wheel',cancelStudyScroll,{passive:true});
  window.addEventListener('touchstart',cancelStudyScroll,{passive:true});
  window.addEventListener('keydown',event=>{
    if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Tab','Escape'].includes(event.key))cancelStudyScroll();
  });
  data.projects.forEach((p,i)=>{
    const btn=make('button','work-card reveal');btn.type='button';btn.dataset.category=p.category;btn.dataset.projectId=p.id;
    btn.setAttribute('aria-label',p.title+' 자세히 보기');
    btn.style.setProperty('--delay',(i%2)*80+'ms');
    const media=make('div','work-media');
    const src=thumbnail(p);
    const placeholder=make('div','empty-media','영상 링크·이미지 등록 후\n썸네일이 표시됩니다.');
    media.append(placeholder);
    if(src){
      const img=make('img','registered-media');
      img.alt=p.title+' 대표 이미지';img.loading='lazy';img.decoding='async';
      img.addEventListener('load',()=>{img.classList.add('loaded');placeholder.hidden=true},{once:true});
      img.addEventListener('error',()=>{img.remove();placeholder.hidden=false},{once:true});
      media.append(img);window.PortfolioAdminModel.loadThumbnail(img,p,safeMediaPath);
    }
    media.append(make('span','media-play','↗'));
    const meta=make('div','work-meta');meta.append(make('strong','',p.title),make('span','',p.category));btn.append(media,meta);

    // Opt-in previewFile is optional; existing local videoFile remains supported.
    // YouTube URLs are never used as hover players.
    const previewSrc=safeMediaPath(p.previewFile);
    if(previewSrc&&/\.(mp4|webm)(?:[?#]|$)/i.test(previewSrc)){
      let video=null,previewRevision=0,unavailable=false;
      const stop=()=>{
        previewRevision++;
        if(!video)return;
        video.pause();video.classList.remove('playing');
        try{video.currentTime=0}catch{/* Metadata may not yet be loaded. */}
      };
      previewStops.set(btn,stop);
      btn.addEventListener('pointerenter',()=>{
        if(!workHover.matches||workMotion.matches||unavailable||btn.hidden)return;
        const revision=++previewRevision;
        if(!video){
          video=make('video','work-preview');video.muted=true;video.defaultMuted=true;
          video.playsInline=true;video.loop=true;video.preload='none';
          video.setAttribute('aria-hidden','true');video.tabIndex=-1;
          video.addEventListener('error',()=>{unavailable=true;stop();video.remove()});
          video.src=previewSrc;media.append(video);
        }
        video.play().then(()=>{
          if(revision===previewRevision&&btn.matches(':hover')&&!btn.hidden)video.classList.add('playing');
          else if(revision===previewRevision)stop();
        }).catch(()=>{if(revision===previewRevision)stop()});
      });
      btn.addEventListener('pointerleave',stop);
      btn.addEventListener('blur',stop);
    }
    btn.addEventListener('click',()=>{
      previewStops.forEach(stop=>stop());
      selected=locateProject(btn.dataset.projectId);updateProject(selected);
      scrollToStudy();
    });
    grid.append(btn);
  });
  const stopWorkPreviews=()=>previewStops.forEach(stop=>stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopWorkPreviews()});
  workHover.addEventListener('change',()=>{if(!workHover.matches)stopWorkPreviews()});
  workMotion.addEventListener('change',()=>{
    stopWorkPreviews();
    if(workMotion.matches){
      filterAnimations.forEach(a=>a.cancel());
      const moving=studyScrollFrame!==null;cancelStudyScroll();
      if(moving){$('#study').scrollIntoView({behavior:'instant'});focusStudy();}
    }
  });
  const filterRow=$('.filter-row');filterRow.replaceChildren();
  [{id:'all',name:'ALL'},...data.filterCategories.filter(c=>data.projects.some(p=>p.filterCategoryIds.includes(c.id)))].forEach((category,i)=>{
    const b=make('button','filter'+(i===0?' active':''),category.name);b.type='button';b.dataset.filter=category.id;b.setAttribute('aria-pressed',String(i===0));filterRow.append(b);
  });
  const filters=$$('.filter',filterRow);
  const animateFilter=(card,frames,options)=>{
    if(!card.animate)return Promise.resolve();
    const animation=card.animate(frames,options);
    filterAnimations.add(animation);
    return animation.finished.catch(()=>{}).finally(()=>{animation.cancel();filterAnimations.delete(animation)});
  };
  filters.forEach(b=>b.addEventListener('click',async()=>{
    if(b.classList.contains('active'))return;
    const revision=++filterRevision;
    filterAnimations.forEach(a=>a.cancel());filterAnimations.clear();
    stopWorkPreviews();
    filters.forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});
    const f=b.dataset.filter,cards=$$('.work-card');
    const matches=cards.map((card,i)=>{
      const p=data.projects[i];
      return f==='all'||p.filterCategoryIds.includes(f);
    });
    if(!workMotion.matches){
      await Promise.all(cards.filter((card,i)=>!card.hidden&&!matches[i]).map(card=>
        animateFilter(card,[{opacity:getComputedStyle(card).opacity},{opacity:0}],{duration:140,easing:'ease-out',fill:'forwards'})
      ));
    }
    if(revision!==filterRevision)return;
    const oldRects=new Map(cards.filter(card=>!card.hidden).map(card=>[card,card.getBoundingClientRect()]));
    cards.forEach((card,i)=>{card.hidden=!matches[i]});
    let visibleIndex=0;
    cards.forEach(card=>{
      if(card.hidden)return;
      card.classList.add('visible');
      const rect=card.getBoundingClientRect(),old=oldRects.get(card),index=visibleIndex++;
      if(workMotion.matches)return;
      const transform=old?'translate('+(old.left-rect.left)+'px,'+(old.top-rect.top)+'px)':'translateY(16px)';
      animateFilter(card,[
        {opacity:old?1:0,transform},
        {opacity:1,transform:'translate(0,0)'}
      ],{duration:600,delay:index*80,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});
    });
  }));
  // Explicit startTime opts into a preview; legacy seconds never changes image behavior.
  const stillStartSeconds=value=>{
    if(typeof value!=='string'||value.length>16)return null;
    const time=value.trim();
    if(!/^\d+:[0-5]\d$/.test(time)&&!/^\d+:[0-5]\d:[0-5]\d$/.test(time))return null;
    const seconds=time.split(':').reduce((total,part)=>total*60+Number(part),0);
    return Number.isSafeInteger(seconds+180)?seconds:null;
  };
  // Native dialog supplies modal focus trapping and Escape; no library required.
  const mediaDialog=make('dialog','media-lightbox');
  mediaDialog.setAttribute('aria-labelledby','media-lightbox-caption');
  const mediaClose=make('button','media-lightbox-close','닫기');
  mediaClose.type='button';mediaClose.setAttribute('aria-label','확대 이미지 닫기');
  const mediaCaption=make('p','media-lightbox-caption');mediaCaption.id='media-lightbox-caption';
  const mediaImage=make('img','media-lightbox-image');mediaImage.decoding='async';mediaImage.hidden=true;
  const mediaStatus=make('p','media-lightbox-status');
  mediaStatus.setAttribute('role','status');
  const mediaVideo=make('div','media-lightbox-video');mediaVideo.hidden=true;
  mediaDialog.append(mediaClose,mediaCaption,mediaImage,mediaVideo,mediaStatus);document.body.append(mediaDialog);
  let mediaOrigin=null;
  const stopMediaVideo=()=>{
    $$('iframe',mediaVideo).forEach(frame=>{frame.src='about:blank';frame.remove()});
    mediaVideo.hidden=true;mediaDialog.classList.remove('media-lightbox-playing');
  };
  const closeMediaLightbox=()=>{stopMediaVideo();if(mediaDialog.open)mediaDialog.close()};
  mediaClose.addEventListener('click',closeMediaLightbox);
  mediaDialog.addEventListener('cancel',()=>{stopMediaVideo()});
  mediaDialog.addEventListener('click',event=>{
    const r=mediaDialog.getBoundingClientRect();
    if(event.target===mediaDialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))closeMediaLightbox();
  });
  mediaDialog.addEventListener('close',()=>{
    // A queued close event must not clear a preview that was already reopened.
    if(mediaDialog.open)return;
    stopMediaVideo();
    mediaImage.onload=null;mediaImage.onerror=null;
    mediaImage.removeAttribute('src');mediaImage.hidden=true;
    if(mediaOrigin?.isConnected&&!mediaOrigin.disabled)mediaOrigin.focus({preventScroll:true});
    mediaOrigin=null;
  });
  function openMediaLightbox(src,caption,origin){
    if(!mediaDialog.showModal)return;
    stopMediaVideo();mediaClose.textContent='닫기';mediaClose.setAttribute('aria-label','확대 이미지 닫기');
    mediaOrigin=origin;mediaCaption.textContent=caption;
    mediaImage.hidden=true;mediaImage.alt=caption;mediaStatus.textContent='이미지를 불러오는 중입니다.';
    mediaImage.onload=()=>{mediaImage.hidden=false;mediaStatus.textContent=''};
    mediaImage.onerror=()=>{mediaImage.hidden=true;mediaImage.removeAttribute('src');mediaStatus.textContent='이미지를 불러올 수 없습니다.'};
    mediaDialog.showModal();mediaClose.focus();mediaImage.src=src;
  }
  function openStillVideo(id,start,caption,origin){
    if(!mediaDialog.showModal)return;
    stopMediaVideo();
    mediaImage.onload=null;mediaImage.onerror=null;mediaImage.removeAttribute('src');mediaImage.hidden=true;
    mediaStatus.textContent='';mediaOrigin=origin;mediaCaption.textContent=caption;
    mediaClose.textContent='×';mediaClose.setAttribute('aria-label','영상 미리보기 닫기');
    const frame=make('iframe');frame.title=caption+' · 3분 영상 미리보기';
    frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
    const embed=new URL('https://www.youtube.com/embed/'+id);
    // YouTube end is absolute from the original video's beginning.
    embed.search=new URLSearchParams({autoplay:'1',playsinline:'1',controls:'1',rel:'0',start:String(start),end:String(start+180)}).toString();
    mediaDialog.classList.add('media-lightbox-playing');mediaVideo.hidden=false;
    mediaVideo.append(frame);mediaDialog.showModal();mediaClose.focus();frame.src=embed.href;
  }
  // Study content is data-driven; optional fields never acquire invented values.
  const studyVideo=p=>{
    return [p.previewFile,p.videoFile,p.url].map(safeMediaPath).find(src=>/\.(mp4|webm)(?:[?#]|$)/i.test(src))||'';
  };
  const studySummary=make('p','project-description');
  studySummary.id='detail-summary';
  $('.study-info dl').after(studySummary);
  $('.study-info').classList.remove('reveal','visible');
  $('#video-shell').classList.remove('reveal','visible');
  let studyTargets=[],studyAnimations=[];
  const studyObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    entries.forEach(({target,isIntersecting})=>{
      if(!isIntersecting)return;
      studyObserver.unobserve(target);
      if(workMotion.matches||!target.animate)return;
      studyAnimations.push(target.animate([
        {opacity:0,transform:'translateY('+ (target.id==='video-shell'?20:12)+'px)'},
        {opacity:1,transform:'translateY(0)'}
      ],{duration:650,delay:Number(target.dataset.studyDelay||0),easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'}));
    });
  },{threshold:0,rootMargin:'0px 0px -20px 0px'}):null;
  workMotion.addEventListener('change',()=>{
    if(workMotion.matches)studyAnimations.forEach(animation=>animation.cancel());
  });
  function queueStudyReveal(){
    studyTargets.forEach(el=>studyObserver?.unobserve(el));
    studyAnimations.forEach(animation=>animation.cancel());studyAnimations=[];
    studyTargets=$$('#detail-category,#detail-title,#detail-summary,.study-info dl > div,#video-shell,#editing-points > .edit-point');
    studyTargets.filter(el=>!el.hidden).forEach((el,i)=>{
      el.dataset.studyDelay=String((i%3)*80);
      studyObserver?.observe(el);
    });
  }
  function updateProject(p){
    closeMediaLightbox();
    if(!p){
      $('#study').dataset.projectId='';
      ['detail-category','detail-title','detail-type','detail-role','detail-tools'].forEach(id=>$('#'+id).textContent='');

      studySummary.textContent='';studySummary.hidden=true;
      $$('.study-info dl > div').forEach(row=>row.hidden=true);
      populatePlayer({});
      const points=$('#editing-points');points.replaceChildren();
      ['01 / STORY','02 / CUT','03 / CAPTION'].forEach(label=>{
        const el=make('div','edit-point');el.append(make('p','',label),make('h4','',''));points.append(el);
      });
      populateStills({title:'',stills:[]});queueStudyReveal();
      return;
    }
    $('#study').dataset.projectId=p.id;
    $('#detail-category').textContent=`${p.number} / ${safeString(p.type||p.category).toUpperCase()}`;
    const title=$('#detail-title');
    const titleLines=safeString(p.title).replace(/ (VLOG\b)/,'\n$1').split('\n');
    title.replaceChildren(make('span','detail-title-highlight',titleLines[0]));
    titleLines.slice(1).forEach(line=>title.append(document.createElement('br'),document.createTextNode(line)));
    $('#detail-type').textContent=p.type;
    $('#detail-role').textContent=p.role;
    $('#detail-tools').textContent=p.tools;
    studySummary.textContent=safeString(p.description||p.summary);
    studySummary.hidden=!studySummary.textContent.trim()||Boolean(p.points?.length);
    ['type','role','tools'].forEach(key=>{
      const field=$('#detail-'+key);
      field.textContent=safeString(p[key]);
      field.closest('dl > div').hidden=!field.textContent.trim();
    });
    populatePlayer(p);
    const points=$('#editing-points');points.replaceChildren();
    const labels=['01 / STORY','02 / CUT','03 / CAPTION'];
    const registered=Array.isArray(p.points)?p.points:[];
    const supplied=Array.from({length:Math.max(3,registered.length)},(_,i)=>registered[i]||[labels[i],'']);
    points.hidden=false;
    supplied.forEach(([title,description])=>{const el=make('div','edit-point');el.append(make('p','',title),make('h4','',description));points.append(el)});
    populateStills(p);
    queueStudyReveal();
  }
  let studyPlayer = null, studyPlayerRevision = 0, youtubeAPI = null, studyFullLink = null;
  function logStudyVideo(event,details={},level='info'){
    const entry={time:new Date().toISOString(),event,...details};
    const history=window.SOJUNG_VIDEO_DIAGNOSTICS||(window.SOJUNG_VIDEO_DIAGNOSTICS=[]);
    history.push(entry);if(history.length>100)history.shift();
    console[level]('[PROJECT STUDY]',entry);
  }
  function loadYouTubeAPI(){
    if(window.YT?.Player)return Promise.resolve(window.YT);
    if(youtubeAPI)return youtubeAPI;
    youtubeAPI=new Promise(resolve=>{
      const previous=window.onYouTubeIframeAPIReady;
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
      // A slow API is not evidence of a playback failure. Keep waiting for readiness.
      const timer=setTimeout(()=>logStudyVideo('api-loading-delayed',{playerRetained:true},'warn'),10000);
      window.onYouTubeIframeAPIReady=()=>{
        try{if(typeof previous==='function')previous();}catch(error){logStudyVideo('previous-api-callback-error',{message:error.message},'warn');}
        const api=window.YT?.Player?window.YT:null;
        logStudyVideo('api-ready',{available:Boolean(api)});finish(api);
      };
      let script=document.querySelector('script[src="https://www.youtube.com/iframe_api"],script[src="https://www.youtube.com/player_api"]');
      const existing=Boolean(script);if(!script){script=make('script');script.src='https://www.youtube.com/iframe_api';script.async=true;}
      script.referrerPolicy='strict-origin-when-cross-origin';
      script.addEventListener('error',()=>{logStudyVideo('api-load-error',{playerRetained:true},'warn');finish(null);youtubeAPI=null;if(!existing)script.remove();},{once:true});
      logStudyVideo('api-loading',{existingScript:existing});if(!existing)document.head.append(script);
    });
    return youtubeAPI;
  }
  function populatePlayer(p,start=0){
    const box=$('#video-shell'),revision=++studyPlayerRevision;
    const startedAt=Date.now();
    const trace=(event,details={},level='info')=>logStudyVideo(event,{projectId:p.id||'',videoId:youtubeId(p.url)||'',revision,elapsedMs:Date.now()-startedAt,origin:window.location.origin,...details},level);
    trace('project-selected',{previewFile:p.previewFile||'',videoFile:p.videoFile||''});
    if(studyFullLink){studyFullLink.remove();studyFullLink=null;}
    if(studyPlayer){const previous=studyPlayer;studyPlayer=null;try{previous.destroy();}catch{}}
    $$('video',box).forEach(video=>{video.pause();video.removeAttribute('src');video.load()});
    $$('iframe',box).forEach(frame=>frame.src='about:blank');box.replaceChildren();box.dataset.playbackState='thumbnail';
    const source=studyVideo(p),id=youtubeId(p.url),seconds=Math.max(0,Math.floor(Number(start)||0));
    if(!source&&!id){const empty=make('div','video-empty');empty.setAttribute('role','status');empty.setAttribute('aria-label','이 프로젝트의 영상은 아직 등록되지 않았습니다.');box.append(empty);return;}
    let activeVideo=null,posterURL='',starting=false;
    const current=()=>revision===studyPlayerRevision;
    const watch=new URL('https://www.youtube.com/watch');if(id)watch.searchParams.set('v',id);if(seconds)watch.searchParams.set('t',seconds+'s');
    const externalLink=text=>{const link=make('a','',text);link.href=watch.href;link.target='_blank';link.rel='noopener';link.referrerPolicy='strict-origin-when-cross-origin';return link;};
    if(id){studyFullLink=externalLink('전체 영상 보기 ↗');studyFullLink.className='study-full-video-link';$('.study-info').append(studyFullLink);}
    function showCover(message=''){
      if(!current())return;starting=false;activeVideo=null;
      const cover=make('button','study-video-cover');cover.type='button';cover.setAttribute('aria-label',p.title+' 영상 미리보기');cover.addEventListener('click',()=>play(cover));
      const poster=make('img','study-video-poster');poster.alt=p.title+' 영상 썸네일';
      const icon=make('span','study-video-play');icon.setAttribute('aria-hidden','true');cover.append(poster,icon);box.replaceChildren(cover);
      if(message){const note=make('div','study-playback-note');note.setAttribute('role','status');note.append(make('p','',message));if(id)note.append(externalLink('YouTube에서 전체 영상 보기 ↗'));box.append(note);}
      window.PortfolioAdminModel.loadThumbnail(poster,p,safeMediaPath).then(result=>{
        if(!current()||!result)return;posterURL=result.url;if(activeVideo&&box.contains(activeVideo))activeVideo.poster=posterURL;
      });
    }
    function fail(video,reason='media-file-error',details={}){
      if(!current()||(video&&!box.contains(video)))return;
      trace('playback-failed',{reason,...details},'error');box.dataset.playbackState='error';
      if(video){video.pause();video.removeAttribute('src');video.load();}
      $$('iframe',box).forEach(frame=>frame.src='about:blank');box.replaceChildren();
      if(studyPlayer){const previous=studyPlayer;studyPlayer=null;try{previous.destroy();}catch{}}
      showCover(id?'미리보기를 불러오지 못했습니다. 전체 영상으로 확인해 주세요.':'영상을 불러오지 못했습니다. 눌러서 다시 시도해 주세요.');
    }
    function play(cover){
      if(starting||!current()||!box.contains(cover))return;starting=true;
      box.dataset.playbackState='loading';trace('preview-click',{source:source||'youtube',protocol:window.location.protocol});
      if(source){
        const video=make('video');activeVideo=video;video.controls=true;video.playsInline=true;video.preload='metadata';video.autoplay=false;video.muted=false;
        video.setAttribute('aria-label',p.title+' 영상 재생');if(posterURL)video.poster=posterURL;
        video.addEventListener('error',()=>fail(video,'media-file-error',{url:source,mediaErrorCode:video.error?.code||null}),{once:true});
        video.addEventListener('playing',()=>{if(current()&&box.contains(video)){box.dataset.playbackState='playing';trace('media-playing',{url:source});}});
        video.addEventListener('loadedmetadata',()=>{if(current()&&box.contains(video)&&seconds)video.currentTime=Math.min(seconds,Math.max(0,(video.duration||seconds)-.1));},{once:true});
        video.src=source;box.replaceChildren(video);video.focus({preventScroll:true});
        // A play request from this click is intentional playback, not page-load autoplay.
        const request=video.play();if(request)request.catch(error=>{if(!current()||!box.contains(video))return;if(error.name==='NotAllowedError'){box.dataset.playbackState='autoplay-blocked';trace('media-autoplay-blocked',{playerRetained:true},'warn');}else if(error.name!=='AbortError')fail(video,'media-play-rejected',{name:error.name,message:error.message,url:source});});
        return;
      }
      if(!['http:','https:'].includes(window.location.protocol)){fail(null,'unsupported-page-protocol',{protocol:window.location.protocol});return;}
      const frame=make('iframe');frame.title=p.title+' 영상 재생';frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
      frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
      const embed=new URL('https://www.youtube.com/embed/'+id);embed.search=new URLSearchParams({autoplay:'1',playsinline:'1',controls:'1',rel:'0',start:String(seconds),enablejsapi:'1',origin:window.location.origin}).toString();
      const isActive=()=>current()&&box.contains(frame);
      frame.src=embed.href;
      frame.addEventListener('error',()=>{if(isActive())trace('iframe-error-event',{playerRetained:true,note:'No YouTube error code; not classified as playback failure.'},'warn');});
      frame.addEventListener('load',()=>{if(isActive())trace('iframe-loaded',{playbackConfirmed:false});});
      box.replaceChildren(frame);frame.focus({preventScroll:true});
      trace('iframe-created',{url:frame.src,referrerPolicy:frame.getAttribute('referrerpolicy'),sandbox:frame.getAttribute('sandbox'),pageURL:window.location.href});
      let attached=false,autoplayBlocked=false,readyPlayRequested=false;
      const errorReasons={2:'invalid-video-id',5:'html5-playback-error',100:'video-missing-or-private',101:'embedding-disabled',150:'embedding-disabled',153:'missing-referer-or-client-identity'};
      loadYouTubeAPI().then(api=>{
        if(!isActive())return;
        if(!api){trace('api-unavailable',{playerRetained:true},'warn');return;}
        if(attached)return;attached=true;
        try{
          const player=new api.Player(frame,{events:{
            onReady:event=>{
              if(!isActive())return;
              // One request only; buffering or autoplay denial never triggers retries/destruction.
              let state;try{state=event.target.getPlayerState();}catch{}
              box.dataset.playbackState=state===1?'playing':state===3?'buffering':autoplayBlocked?'autoplay-blocked':'ready';trace('youtube-ready',{playerState:state,referrerPolicy:frame.getAttribute('referrerpolicy')});
              if(!readyPlayRequested&&!autoplayBlocked&&state!==1&&state!==3){readyPlayRequested=true;try{event.target.playVideo();trace('youtube-play-requested');}catch(error){trace('youtube-play-request-error',{message:error.message,playerRetained:true},'warn');}}
            },
            onStateChange:event=>{
              if(!isActive())return;
              const states={'-1':'unstarted',0:'ended',1:'playing',2:'paused',3:'buffering',5:'cued'};
              box.dataset.playbackState=states[event.data]||'unknown';trace('youtube-state-change',{state:event.data,stateName:states[event.data]||'unknown'});
            },
            onAutoplayBlocked:()=>{if(isActive()){autoplayBlocked=true;box.dataset.playbackState='autoplay-blocked';trace('youtube-autoplay-blocked',{playerRetained:true},'warn');}},
            onError:event=>{
              if(!isActive())return;const code=Number(event.data),reason=errorReasons[code];
              trace('youtube-error',{code,reason:reason||'unknown',playerRetained:!reason},'error');
              if(reason)fail(null,'youtube-onError',{code,meaning:reason});
            }
          }});
          if(isActive())studyPlayer=player;else{try{player.destroy();}catch{}}
        }catch(error){trace('api-player-construction-error',{message:error.message,playerRetained:true},'warn');}
      });
    }
    showCover();
  }
  function populateStills(p){
    const root=$('#stills');root.replaceChildren();
    const registered=(Array.isArray(p.stills)?p.stills:[]).slice(0,4);
    root.hidden=false;$('.stills-header').hidden=false;
    Array.from({length:4},(_,i)=>registered[i]||{image:''}).forEach((frame,i)=>{
      const label='STILL '+String(i+1).padStart(2,'0');
      const title=typeof frame.title==='string'?frame.title.trim():'';
      const description=typeof frame.caption==='string'?frame.caption:typeof frame.description==='string'?frame.description:'';
      const start=stillStartSeconds(frame.startTime),videoId=youtubeId(p.url),hasVideo=start!==null&&Boolean(videoId);
      const b=make('button','still-card');b.type='button';b.disabled=true;
      b.setAttribute('aria-label',p.title+' '+label+(title?' · '+title:'')+(hasVideo?' 3분 영상 미리보기':' 이미지 확대'));
      const preview=make('div','still-preview');
      const src=safeMediaPath(frame?.image);
      if(src){
        const img=make('img','registered-media');img.alt=frame.alt||title||description||p.title+' '+label;
        img.loading='lazy';img.decoding='async';
        img.addEventListener('load',()=>{img.classList.add('loaded');b.disabled=false},{once:true});
        img.addEventListener('error',()=>{img.remove();b.disabled=true},{once:true});
        img.src=src;preview.append(img);
        b.addEventListener('click',()=>{
          if(b.disabled)return;
          const caption=p.title+' / '+label+(title?' · '+title:'');
          if(hasVideo)openStillVideo(videoId,start,caption,b);
          else openMediaLightbox(src,caption,b);
        });
      }
      b.append(preview,make('span','still-title',label+(title?' / '+title:'')));if(description.trim())b.append(make('small','still-description',description));root.append(b);
    });
  }
  updateProject(selected);

  // Reveal profile details without moving the column or its divider.
  const profileGroups=[
    ['.portrait',0],
    ['.profile-left h2,.profile-greeting,.profile-bio,.signature',90],


    ['.profile-right > .profile-feature:nth-child(2)',270],
    ['.skill-panel',360]
  ];
  profileGroups.forEach(([selector,delay])=>$$(selector).forEach(el=>{
    el.classList.add('reveal');
    el.style.setProperty('--delay',delay+'ms');
  }));
  $$('.line-reveal').forEach((el,i)=>el.style.setProperty('--delay',(i%3)*90+'ms'));

  // Animate content, not its section borders. Keep existing text and <br> flow.
  const what=$('.profile-right > .profile-feature:first-child');
  what.classList.remove('reveal','visible');
  const revealProfile=(el,delay,cls)=>{
    el.classList.add('reveal',cls);
    el.style.setProperty('--delay',delay+'ms');
  };
  revealProfile($('.eyebrow',what),120,'profile-detail-reveal');
  revealProfile($('h3',what),120,'profile-title-reveal');
  const description=$('p:not(.eyebrow)',what);
  let descriptionIndex=0;
  Array.from(description.childNodes).forEach(node=>{
    if(node.nodeType!==Node.TEXT_NODE||!node.textContent.trim())return;
    const line=make('span','profile-description-line',node.textContent);
    revealProfile(line,210+descriptionIndex++*90,'profile-detail-reveal');
    node.replaceWith(line);
  });
  const experience=$('.profile-bottom > .profile-feature:not(.skill-panel)');
  experience.classList.remove('reveal','visible');
  revealProfile($('.eyebrow',experience),180,'profile-detail-reveal');
  $$('.experience',experience).forEach((el,i)=>{
    revealProfile(el,180+i*80,'profile-experience-reveal');
  });
  // Keep a generous reset boundary outside the reveal boundary.
  // Nearby scroll reversals leave content visible; a full reentry replays it.
  $$('.contact-box').forEach(el=>el.style.setProperty('--delay','180ms'));
  const revealTargets=$$('.reveal,.line-reveal');
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{
      if(isIntersecting)target.classList.add('visible');
    }),{threshold:0,rootMargin:'0px 0px -24px 0px'});
    const resetObserver=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{
      if(!isIntersecting&&!target.contains(document.activeElement))target.classList.remove('visible');
    }),{threshold:0,rootMargin:'160px 0px 160px 0px'});
    revealTargets.forEach(el=>{observer.observe(el);resetObserver.observe(el)});
  }else revealTargets.forEach(el=>el.classList.add('visible'));
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const scene=$('.intro-scene');
  let pending=false;
  const clamp=v=>Math.min(1,Math.max(0,v));
  function paint(){
    // No pinning, image swapping or layout changes; CONTENTS follows in normal flow.
    const p=motion.matches?0:clamp(-scene.getBoundingClientRect().top/Math.max(1,scene.offsetHeight*.65));
    scene.style.setProperty('--intro-progress',String(1-Math.pow(1-p,3)));
    $('.progress-bar').style.width=clamp(window.scrollY/Math.max(1,document.documentElement.scrollHeight-window.innerHeight))*100+'%';
    pending=false;
  }
  const repaint=()=>{if(!pending){pending=true;requestAnimationFrame(paint)}};
  window.addEventListener('scroll',repaint,{passive:true});
  window.addEventListener('resize',repaint);
  motion.addEventListener('change',repaint);
  paint();
  window.SOJUNG_RENDER_READY=true;
  window.dispatchEvent(new Event('sojung:ready'));
})();
