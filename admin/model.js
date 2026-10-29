(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaultFilters = [{id:'vlog',name:'VLOG'},{id:'short',name:'SHORT FORM'},{id:'brand',name:'BRAND'}];
  function filterIds(project) {
    if (Array.isArray(project.filterCategoryIds)) return project.filterCategoryIds;
    const label = ((project.category || '') + ' ' + (project.type || '')).toLowerCase();
    return defaultFilters.filter(c => label.includes(c.id === 'short' ? 'short' : c.id)).map(c => c.id);
  }
  function normalizeFilters(data) {
    const next = clone(data);
    next.filterCategories = clone(data.filterCategories === undefined ? defaultFilters : data.filterCategories);
    next.projects.forEach(p => { if (p.filterCategoryIds === undefined) p.filterCategoryIds = filterIds(p).filter(id => next.filterCategories.some(c => c.id === id)); });
    return next;
  }
  const mediaFields = ['url', 'videoFile', 'thumbnail', 'previewFile'];
  const imageExtension = /\.(jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
  const videoExtension = /\.(mp4|webm)(?:[?#]|$)/i;
  function validPath(value) {
    if (!value) return true;
    if (typeof value !== 'string' || /[\x00-\x1f\\]/.test(value)) return false;
    try {
      const decoded = decodeURIComponent(value);
      if (/[\x00-\x1f\\]/.test(decoded) || decoded.split(/[/?#]/).includes('..')) return false;
      if (value.startsWith('assets/')) return true;
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  }
  function youtubeId(value) {
    try {
      const u = new URL(value);
      if (!['https:', 'http:'].includes(u.protocol)) return '';
      if (u.username || u.password) return '';
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      const path = u.pathname.split('/').filter(Boolean);
      const id = host === 'youtu.be' ? path[0] : ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)
        ? (path[0] === 'watch' ? u.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(path[0]) ? path[1] : '') : '';
      return /^[-_a-zA-Z0-9]{11}$/.test(id || '') ? id : '';
    } catch { return ''; }
  }
  function validateMedia(field, value) {
    if (value === undefined || value === '') return '';
    if (typeof value !== 'string') return '문자열 경로를 입력하세요.';
    if (field === 'url') return youtubeId(value) || (validPath(value) && videoExtension.test(value)) ? '' : '실제 YouTube 링크 또는 MP4/WebM 주소를 입력하세요.';
    if (!validPath(value)) return 'assets/ 경로 또는 인증정보 없는 HTTPS 주소를 입력하세요.';
    if (field === 'videoFile' || field === 'previewFile') return videoExtension.test(value) ? '' : 'MP4 또는 WebM 파일만 지원합니다.';
    // HTTPS image services may intentionally omit a filename extension.
    if (value.startsWith('https://')) {
      const path = new URL(value).pathname;
      return /\/[^/]+\.[a-z0-9]+$/i.test(path) && !imageExtension.test(path) ? '지원하는 이미지 확장자를 사용하세요.' : '';
    }
    return imageExtension.test(value) ? '' : 'JPG, PNG, WebP, GIF, AVIF 이미지만 지원합니다.';
  }
  function validateData(data) {
    const errors = [], ids = new Set();
    if (!data || Array.isArray(data) || typeof data !== 'object' || !data.profile || !data.contact || !Array.isArray(data.projects)) return ['profile, contact, projects를 포함한 전체 데이터 객체가 필요합니다.'];
    function inspect(value, depth) {
      if (depth > 30) { errors.push('데이터 중첩이 너무 깊습니다.'); return; }
      if (value && typeof value === 'object') Object.keys(value).forEach(key => {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) errors.push('허용하지 않는 데이터 키: ' + key);
        else inspect(value[key], depth + 1);
      });
    }
    inspect(data, 0);
    const categories = data.filterCategories === undefined ? defaultFilters : data.filterCategories;
    const categoryIds = new Set(), categoryNames = new Set();
    if (!Array.isArray(categories)) errors.push('필터 카테고리는 배열이어야 합니다.');
    else categories.forEach(c => {
      const name = typeof c?.name === 'string' ? c.name.trim().normalize('NFKC').toUpperCase() : '';
      if (!c || typeof c.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(c.id) || c.id.toLowerCase() === 'all' || categoryIds.has(c.id) || !name || name === 'ALL' || name.length > 60 || categoryNames.has(name)) errors.push('필터 ID·이름은 중복될 수 없으며 ALL은 등록할 수 없습니다. 이름은 60자 이하로 입력하세요.');
      categoryIds.add(c?.id); categoryNames.add(name);
    });
    const p = data.profile;
    if (typeof p.description !== 'string' || !Array.isArray(p.keywords) || !p.keywords.every(k => typeof k === 'string') || !Array.isArray(p.tools) || !p.tools.every(t => t && typeof t.short === 'string' && typeof t.name === 'string' && Number.isFinite(t.progress) && t.progress >= 0 && t.progress <= 1)) errors.push('PROFILE 원본 데이터 형식을 확인하세요.');
    if (!['phone', 'email', 'youtube'].every(key => typeof data.contact[key] === 'string')) errors.push('CONTACT 원본 데이터 형식을 확인하세요.');
    if (data.contact.youtube && !validPath(data.contact.youtube)) errors.push('CONTACT 링크는 안전한 HTTPS 주소여야 합니다.');
    data.projects.forEach((project, i) => {
      const label = '프로젝트 ' + (i + 1) + ': ';
      if (!project || Array.isArray(project) || typeof project !== 'object') { errors.push(label + '객체가 필요합니다.'); return; }
      if (typeof project.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(project.id) || ids.has(project.id)) errors.push(label + '중복 없는 영문 ID가 필요합니다.');
      ids.add(project.id);
      if (project.filterCategoryIds !== undefined && (!Array.isArray(project.filterCategoryIds) || project.filterCategoryIds.some(id => typeof id !== 'string' || !categoryIds.has(id)) || new Set(project.filterCategoryIds).size !== project.filterCategoryIds.length)) errors.push(label + '필터 카테고리 연결을 확인하세요.');
      if (typeof project.title !== 'string' || !project.title.trim()) errors.push(label + '제목이 필요합니다.');
      ['number', 'category', 'type', 'role', 'tools', 'summary', 'description'].forEach(key => { if (project[key] !== undefined && typeof project[key] !== 'string') errors.push(label + key + '는 문자열이어야 합니다.'); });
      if (project.visible !== undefined && typeof project.visible !== 'boolean') errors.push(label + 'visible은 true/false 값이어야 합니다.');
      mediaFields.forEach(key => { const message = validateMedia(key, project[key]); if (message) errors.push(label + key + ': ' + message); });
      if (project.points !== undefined && (!Array.isArray(project.points) || !project.points.every(point => Array.isArray(point) && point.length === 2 && point.every(v => typeof v === 'string')))) errors.push(label + 'points는 [라벨, 설명] 배열이어야 합니다.');
      if (project.stills !== undefined && (!Array.isArray(project.stills) || project.stills.length > 4)) errors.push(label + 'STILL은 최대 4장입니다.');
      else (project.stills || []).forEach((frame, n) => {
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) { errors.push(label + 'STILL 객체 형식을 확인하세요.'); return; }
        const message = validateMedia('image', frame.image);
        if (message) errors.push(label + 'STILL ' + (n + 1) + ': ' + message);
        if(frame.caption!==undefined&&(typeof frame.caption!=='string'||frame.caption.length>300))errors.push(label+'STILL '+(n+1)+': 이미지 설명은 300자 이하 문자열이어야 합니다.');
        [['title',120],['description',300],['alt',300]].forEach(([field,limit])=>{if(frame[field]!==undefined&&(typeof frame[field]!=='string'||frame[field].length>limit))errors.push(label+'STILL '+(n+1)+': '+field+'는 '+limit+'자 이하 문자열이어야 합니다.');});
      });
    });
    return errors;
  }
  function updateProject(data, previousId, patch, position) {
    const next = clone(data), index = next.projects.findIndex(p => p.id === previousId);
    if (previousId !== null && index < 0) throw new Error('원본 프로젝트를 찾을 수 없습니다.');
    if (index >= 0 && patch.id !== previousId) throw new Error('기존 프로젝트 ID는 변경할 수 없습니다.');
    const updated = index >= 0 ? { ...next.projects[index], ...clone(patch) } : clone(patch);
    if (index >= 0) next.projects.splice(index, 1);
    next.projects.splice(Math.max(0, Math.min(next.projects.length, position - 1)), 0, updated);
    const errors = validateData(next);
    if (errors.length) throw new Error(errors.join('\n'));
    return next;
  }
  function buildPublicContent(data) {
    const errors = validateData(data);
    if (errors.length) throw new Error(errors.join('\n'));
    // Private projects must not be downloadable from the public JSON at all.
    const normalized = normalizeFilters(data);
    return { schemaVersion: 1, filterCategories:normalized.filterCategories, projects:normalized.projects.filter(p => p.visible !== false) };
  }
  function validatePublicContent(content, fallback) {
    if (!content || content.schemaVersion !== 1 || !Array.isArray(content.projects))
      return ['schemaVersion: 1과 projects 배열이 필요합니다.'];
    return validateData({ ...clone(fallback), filterCategories:content.filterCategories, projects: content.projects });
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function publicSignature(content) {
    const normalized = normalizeFilters(content);
    return canonical({ schemaVersion:1, filterCategories:normalized.filterCategories, projects:normalized.projects.filter(p => p.visible !== false).map(p => ({ ...p, visible:true })) });
  }
  function planPublicMerge(current, content) {
    const errors = validateData(current).concat(validatePublicContent(content, current));
    if (errors.length) throw new Error(errors.join('\n'));
    const hadCategories = current.filterCategories !== undefined;
    current = normalizeFilters(!hadCategories && content.filterCategories !== undefined ? {...current,filterCategories:content.filterCategories} : current); content = normalizeFilters(content);
    const changes = [], additions = [], incomingIds = new Set(content.projects.map(p => p.id));
    content.filterCategories.forEach(category => {
      const existing = current.filterCategories.find(c => c.id === category.id);
      if (existing && canonical(existing) !== canonical(category)) changes.push({id:'FILTER CATEGORIES',field:'filterCategoryName',categoryId:category.id,before:existing.name,after:category.name,canUsePublic:true,usePublic:!hadCategories});
    });
    const meaningful = (key, value) => {
      if (key === 'filterCategoryIds') return Array.isArray(value);
      if (key === 'stills') return Array.isArray(value) && value.some(s => Boolean(s.image||s.title||s.caption||s.description||s.alt));
      if (key === 'points') return Array.isArray(value) && value.some(p => Boolean(p[1]));
      if (typeof value === 'string') return Boolean(value.trim());
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null;
    };
    content.projects.forEach(p => {
      const local = current.projects.find(item => item.id === p.id);
      if (!local) { additions.push(clone(p)); return; }
      const incoming = { ...p, visible:p.visible !== false };
      Object.keys(incoming).filter(key => key !== 'id').forEach(key => {
        if (canonical(local[key]) === canonical(incoming[key])) return;
        changes.push({ id:p.id, field:key, before:clone(local[key] === undefined ? null : local[key]), after:clone(incoming[key]),
          canUsePublic:!(mediaFields.includes(key) && meaningful(key,local[key]) && !meaningful(key,incoming[key])),
          usePublic:key === 'filterCategoryIds' && !hadCategories ? true : !meaningful(key, local[key]) && meaningful(key, incoming[key]) });
      });
    });
    return { changes, additions, preservedIds:current.projects.filter(p => !incomingIds.has(p.id)).map(p => p.id) };
  }
  function mergePublicContent(current, content, decisions) {
    const plan = planPublicMerge(current, content), result = normalizeFilters(current.filterCategories === undefined && content.filterCategories !== undefined ? {...current,filterCategories:content.filterCategories} : current);
    content = normalizeFilters(content);
    if (current.filterCategories === undefined) result.filterCategories = clone(content.filterCategories);
    plan.changes.forEach((change, i) => {
      if (decisions[i] === true && change.canUsePublic) {
        if (change.field === 'filterCategoryName') { result.filterCategories.find(c => c.id === change.categoryId).name = change.after; return; }
        const index = result.projects.findIndex(p => p.id === change.id);
        let value=clone(change.after);
        if (change.field === 'stills') {
          const previous=result.projects[index].stills || [];
          value=Array.from({length:Math.max(previous.length,value.length)},(_,i)=>({
            ...(previous[i] || {}), ...(value[i] || {}), image:value[i]?.image || previous[i]?.image || ''
          }));
        }
        result.projects[index] = { ...result.projects[index], [change.field]:value };
      }
    });
    result.projects.push(...plan.additions);
    const required = new Set(result.projects.flatMap(p => p.filterCategoryIds || []));
    content.filterCategories.forEach(c => { if (required.has(c.id) && !result.filterCategories.some(existing => existing.id === c.id)) result.filterCategories.push(clone(c)); });
    const errors = validateData(result);
    if (errors.length) throw new Error(errors.join('\n'));
    return result;
  }
  function projectMediaState(project = {}) {
    const youtube = youtubeId(project.url);
    const video = [project.videoFile, project.url].find(value => value && !validateMedia('videoFile', value)) || '';
    const explicitThumbnail = project.thumbnail && !validateMedia('thumbnail', project.thumbnail) ? project.thumbnail : '';
    return {
      registered:Boolean(youtube || video), youtubeId:youtube, video,
      thumbnail:explicitThumbnail || (youtube ? 'https://i.ytimg.com/vi/' + youtube + '/maxresdefault.jpg' : ''),
      thumbnailOrigin:explicitThumbnail ? '직접 등록' : youtube ? 'YouTube 자동 썸네일' : '미등록'
    };
  }
  const thumbnailJobs = new WeakMap();
  function thumbnailCandidates(project) {
    const result = [];
    if (project.thumbnail && !validateMedia('thumbnail',project.thumbnail)) result.push({url:project.thumbnail,minWidth:1,minHeight:1});
    const id = youtubeId(project.url);
    if (id) [['maxresdefault',1280,720],['sddefault',640,480],['hqdefault',480,360],['mqdefault',320,180]].forEach(([name,minWidth,minHeight]) => result.push({url:'https://i.ytimg.com/vi/'+id+'/'+name+'.jpg',minWidth,minHeight}));
    return result;
  }
  async function loadThumbnail(target, project, resolvePath = value => value) {
    const token = {}; thumbnailJobs.set(target,token);
    for (const candidate of thumbnailCandidates(project)) {
      const resolved = resolvePath(candidate.url); if (!resolved) continue;
      // A saved replacement can have the same filename; don't reuse an old local bitmap.
      const url = candidate.url.startsWith('assets/') ? resolved+(resolved.includes('?')?'&':'?')+'thumbnail-v='+Date.now() : resolved;
      const dimensions = await new Promise(resolve => {
        const probe = new Image(); let finished = false;
        const done = value => { if (finished) return; finished=true;clearTimeout(timer);probe.onload=probe.onerror=null;resolve(value); };
        const timer = setTimeout(()=>done(null),6000);
        probe.onload=()=>done(probe.naturalWidth>=candidate.minWidth && probe.naturalHeight>=candidate.minHeight ? {width:probe.naturalWidth,height:probe.naturalHeight} : null);
        probe.onerror=()=>done(null); probe.src=url;
      });
      if (thumbnailJobs.get(target)!==token) return null;
      if (!dimensions) continue;
      target.dataset.thumbnailWidth=String(dimensions.width);target.dataset.thumbnailHeight=String(dimensions.height);
      target.dataset.thumbnailSource=url;target.src=url;return {url,...dimensions};
    }
    if (thumbnailJobs.get(target)===token) target.dispatchEvent(new Event('error'));
    return null;
  }
  root.PortfolioAdminModel = { clone, normalizeFilters, filterIds, mediaFields, validateMedia, validateData, updateProject, youtubeId, buildPublicContent, validatePublicContent, projectMediaState,
    publicSignature, planPublicMerge, mergePublicContent, thumbnailCandidates, loadThumbnail };
})(window);
