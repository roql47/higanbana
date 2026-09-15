/** Direct playback of the supplied source, kept separate from the authored 3D view. */
export function installVideoComparison(onShot:(time:number)=>void,onClose:()=>void){
  const panel=document.createElement('aside');panel.id='video-reference';panel.hidden=true;
  panel.innerHTML=`<h2>원본 영상</h2><p>북쪽 전경 · 건물 비례와 논·수목의 분포 대조</p>
    <video controls muted playsinline preload="metadata" src="https://whc-shirakawa-goandgokayama.jp/wp/wp-content/uploads/2024/04/%E8%8D%BB%E7%94%BA%E5%8B%95%E7%94%BB.mp4"></video>
    <nav><button data-time="16">0:16 북쪽 전경</button><button data-time="25">0:25 논과 가옥</button><button data-time="99">1:39 마을 거리</button></nav>
    <p class="reference-note">제작 맵: 북쪽 조망 · 카메라 위치와 렌즈는 근사치입니다.</p>`;
  document.body.append(panel);const video=panel.querySelector('video')!;
  video.addEventListener('loadedmetadata',()=>{video.currentTime=16;},{once:true});
  for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-time]'))button.addEventListener('click',()=>{video.pause();const time=Number(button.dataset['time']);video.currentTime=time;onShot(time);});
  const toggle=document.querySelector<HTMLButtonElement>('#video-compare')!;
  toggle.addEventListener('click',()=>{
    panel.hidden=!panel.hidden;document.body.classList.toggle('reference-open',!panel.hidden);toggle.textContent=panel.hidden?'원본 영상 대조':'영상 대조 닫기';
    document.querySelector('header h1')!.textContent=panel.hidden?'荻町 · 와다 가옥 북쪽 구역':'제작 맵 · 근사 시점';
    if(!panel.hidden){video.currentTime=16;onShot(16);}else{video.pause();onClose();}dispatchEvent(new Event('resize'));
  });
}
