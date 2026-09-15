import {readFileSync,writeFileSync} from 'node:fs';
import {inStoryScope} from '../../src/world/ogimachi/storyScope.ts';
const read=p=>JSON.parse(readFileSync(p,'utf8'));const data=read('public/data/ogimachi/survey.json'),regions=read('public/data/ogimachi/story-selection.json');
const sites=[];
function add(id,name,position,radius,acts,work,buildingId=null){if(buildingId){const b=data.buildings.find(b=>b.id===buildingId);position=[b.x,b.z]}if(!inStoryScope(...position,regions,0))throw Error(`Outside selection: ${id}`);sites.push({id,name,position,radius,acts,work,buildingId,status:id==='intro'?'existing':'proposed'});}
add('intro','종점 · ACT 1/3',[-59,-35],55,'1–3','기존 스토리 좌표와 캐릭터 이동 유지');
add('shrine','중앙 신사 · 지하',[-90,-260],48,'5 · 17–24 · 26–28','신사 경내와 본전 신규 제작. 지하·보스 공간은 별도 층으로 제작');
add('square','광장 · 기록 창고',[-35,-165],30,'4 · 8 · 15–16 · 25','빈터·창고 자리 확보 후 생활 흔적과 축제 무대 배치');
add('school','폐교',null,65,'8–9 · 16 · 25','기존 대형 건물 부지 활용. 교사 외형·교실·복도는 스토리용으로 재제작',435719872);
add('manor','촌장 저택',null,35,'15–16 · 25','기존 부지 활용. 현관·서재·지하 기록실 신규 제작',586010782);
add('hokora','오래된 사당',[-498,-600],22,'6–7 · 16 · 25','산책로 끝 소규모 사당·실내 추격 공간 신규 제작');
add('cemetery','묘지',[-370,-485],32,'12 · 16 · 25','묘석 미로와 석등·우회로 신규 제작');
add('well','공동우물',[-86,-87],18,'10–11 · 16 · 25','지상 조사 공간·수직 우물·지하 수로 신규 제작');
add('grandma','할머니 집',null,22,'16 · 20 · 25','기존 주택 부지를 활용하고 벽장·일기 조사 실내 제작',236248664);
add('inn','폐여관',null,28,'13–14 · 16 · 25','기존 숙소 부지 활용. 2층 퍼즐 동선과 현실/거울 상태 제작',236248637);
add('paddy','논길 · 우회로',[-231.1,225.3],55,'운반 왕복 · 25–26','논두렁 은신·우회 경로와 수로 입구 연결');
add('escape','피안화 탈출길',[-460,570],55,'29–33','남서쪽 길을 활용. 마지막 대화와 새벽 연출 공간 확보');
const links=[['intro','square'],['square','shrine'],['shrine','manor'],['manor','school'],['school','square'],['shrine','cemetery'],['cemetery','hokora'],['cemetery','school'],['shrine','well'],['well','paddy'],['paddy','grandma'],['grandma','inn'],['inn','intro'],['paddy','school'],['shrine','escape']];
const routes=links.map(([a,b])=>({from:a,to:b,kind:b==='escape'?'escape':'proposed',points:[sites.find(s=>s.id===a).position,sites.find(s=>s.id===b).position]}));
// Straight links are design intent, not walkable navigation; only site vicinity drives this first priority pass.
const buildings=data.buildings.map(b=>{const site=sites.find(s=>s.buildingId===b.id);const nearby=sites.filter(s=>Math.hypot(b.x-s.position[0],b.z-s.position[1])<=s.radius+Math.hypot(b.width,b.depth)/2);return{id:b.id,tier:site?'hero':nearby.length?'frontage':'background',sites:site?[site.id]:nearby.map(s=>s.id)}});
const counts=Object.fromEntries(['hero','frontage','background'].map(t=>[t,buildings.filter(b=>b.tier===t).length]));
writeFileSync('public/data/ogimachi/story-layout.json',JSON.stringify({version:1,status:'planning-only',note:'좌표 배치 초안. 연결선은 설계 의도이며 지형·충돌·보행 검증 전. 실제 액트 연결은 1–3만 유지.',sites,routes,buildings,counts},null,2));console.log(counts);
