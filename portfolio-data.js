/*
  SOJUNG VIDEO PORTFOLIO — 콘텐츠 데이터
  url: YouTube 일반/공유/Shorts URL. 없으면 ''.
  videoFile: 직접 호스팅한 MP4/WebM의 assets/ 경로 또는 HTTPS 주소. 없으면 ''.
  thumbnail: 대표 이미지의 assets/ 경로 또는 HTTPS 주소. 비어 있으면 YouTube 썸네일 사용 가능.
  previewFile: 카드 호버용 짧은 무음 MP4/WebM 경로 또는 HTTPS 주소. 선택 사항.
  stills: 최대 4개의 { image: 'assets/...jpg' } 객체. 누락/실패 시 원본 파스텔 카드 유지.
  기존 seconds 값은 호환성을 위해 유지하며, STILL 클릭은 이미지 확대 보기로 동작합니다.
  새 필드명으로 중복 관리하지 않습니다. 자세한 등록 방법: MEDIA_GUIDE.md
  향후 관리자 페이지는 같은 프로젝트 ID와 데이터 구조를 사용할 수 있습니다.
*/
window.SOJUNG_PORTFOLIO_DATA = {
  profile: {
    displayName: '박소정',
    englishName: 'Sojung Park',
    title: 'VIDEO EDITOR / SOJUNG',
    introduction: [
      '안녕하세요.',
      '작은 순간들을 하나의 이야기로 완성하는',
      '영상 편집자 박소정입니다.'
    ],
    description: '평범한 장면도 어떻게 연결하느냐에 따라 특별한 이야기가 된다고 생각합니다. 자연스러운 컷의 흐름, 적절한 자막과 효과음, 그리고 작은 디테일까지. 영상의 분위기와 목적에 맞는 편집으로 보는 재미를 더합니다.',
    experience: ['영상 콘텐츠 기획 · 편집', '개인 유튜브 운영 및 편집', '브랜드 협찬 콘텐츠 제작'],
    keywords: ['#보는재미', '#자연스러운흐름', '#스토리텔링', '#자막디자인', '#리듬감', '#정보전달'],
    tools: [
      { short: 'Pr', name: 'Premiere Pro', progress: .9 },
      { short: 'Fc', name: 'Final Cut Pro', progress: .78 },
      { short: 'Ps', name: 'Photoshop', progress: .86 },
      { short: 'Ai', name: 'Illustrator', progress: .58 },
      { short: 'Fi', name: 'Figma', progress: .88 }
    ]
  },
  contact: {
    phone: '010-9241-1885',
    email: 'ritofbin@naver.com',
    youtube: 'https://youtube.com/channel/UCT_262YwZ2nEiK0yJ6hNt7g'
  },
  projects: [
    {
      id: 'new-york-vlog',
      number: '01',
      title: 'NEW YORK VLOG EP.01',
      category: 'TRAVEL VLOG · STORYTELLING',
      type: 'Travel Vlog / YouTube',
      role: '컷 편집 · 자막 · 사운드',
      tools: 'Premiere Pro · Photoshop',
      summary: '장면의 흐름과 이야기 구성',
      url: 'https://www.youtube.com/watch?v=MunzO3FJUuU',
      videoFile: '',
      previewFile: '',
      thumbnail: '',
      points: [
        ['01 / STORY', '장면의 흐름과 이야기 구성'],
        ['02 / CUT', '속도감 있는 컷 편집'],
        ['03 / CAPTION', '콘텐츠 분위기에 맞는 자막']
      ],
      stills: [
        { seconds: 15, image: '' },
        { seconds: 45, image: '' },
        { seconds: 90, image: '' },
        { seconds: 135, image: '' }
      ]
    },
    { id: 'sponsored', number: '02', title: 'BRAND CONTENT', category: 'SPONSORED CONTENT · EDITING', type: 'Brand Content', role: '작업 내용 등록 예정', tools: '등록 예정', summary: '브랜드 협찬 콘텐츠', url: '', videoFile: '', previewFile: '', thumbnail: '', points: [], stills: [] },
    { id: 'shorts', number: '03', title: 'SHORT FORM', category: 'SHORTS · REELS · MOTION', type: 'Short Form', role: '작업 내용 등록 예정', tools: '등록 예정', summary: '짧은 영상 편집', url: '', videoFile: '', previewFile: '', thumbnail: '', points: [], stills: [] },
    { id: 'lifestyle', number: '04', title: 'LIFESTYLE VLOG', category: 'LIFESTYLE · VIDEO EDITING', type: 'Lifestyle Vlog', role: '작업 내용 등록 예정', tools: '등록 예정', summary: '일상 브이로그 편집', url: '', videoFile: '', previewFile: '', thumbnail: '', points: [], stills: [] }
  ]
};
