/** Local photo alignment aid. Never changes map geometry or stores the source photo. */
export function installPhotoReference(){
 const panel=document.createElement('aside');
 panel.hidden=true;
 panel.style.cssText='position:fixed;right:16px;bottom:65px;z-index:140;background:#17262ef5;color:white;padding:16px;max-width:320px';
 panel.innerHTML='<strong>실제 배경 맞추기</strong><p>사진을 선택하거나 이 패널을 연 상태에서 붙여넣으세요. 기존 맵 위에서 구도를 맞춥니다.</p><input type="file" accept="image/png,image/jpeg,image/webp"><p><label>사진 농도 <input type="range" min="0" max="100" value="50"></label></p><button type="button">사진 지우기</button><p role="status">사진은 이 탭에서만 사용됩니다. 새로고침하면 해제됩니다.</p>';
 const plate=document.createElement('img');plate.alt='배치 기준 사진';
 plate.hidden=true;plate.style.cssText='position:fixed;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:90;opacity:.5';
 const toggle=document.createElement('button');toggle.textContent='실제 배경 맞추기';
 document.querySelector('header nav')!.append(toggle);document.body.append(plate,panel);
 const status=panel.querySelector('[role=status]')!,input=panel.querySelector<HTMLInputElement>('[type=file]')!,opacity=panel.querySelector<HTMLInputElement>('[type=range]')!;
 let source:string|undefined,version=0;
 const clear=()=>{version++;plate.hidden=true;plate.removeAttribute('src');if(source)URL.revokeObjectURL(source);source=undefined;input.value='';};
 const show=async(file:File)=>{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status.textContent='PNG, JPG, WebP 사진을 선택해 주세요.';return;}
  if(file.size>25*1024*1024){status.textContent='25MB 이하의 사진을 선택해 주세요.';return;}
  const revision=++version,url=URL.createObjectURL(file),probe=new Image();probe.src=url;
  try{await probe.decode();}catch{URL.revokeObjectURL(url);if(revision===version)status.textContent='사진을 읽지 못했습니다.';return;}
  if(revision!==version){URL.revokeObjectURL(url);return;}
  if(source)URL.revokeObjectURL(source);source=url;plate.src=url;plate.hidden=false;
  status.textContent=`${file.name||'붙여넣은 사진'} · ${probe.naturalWidth} × ${probe.naturalHeight}. 사진 농도를 낮추고 지도를 움직여 구도를 맞추세요. 새로고침하면 해제됩니다.`;
 };
 input.onchange=()=>{const file=input.files?.[0];if(file)void show(file);};
 opacity.oninput=()=>{plate.style.opacity=String(Number(opacity.value)/100);};
 panel.querySelector('button')!.onclick=()=>{clear();status.textContent='사진을 지웠습니다. 기존 맵은 그대로 유지됩니다.';};
 toggle.onclick=()=>{panel.hidden=!panel.hidden;plate.hidden=panel.hidden||!source;toggle.textContent=panel.hidden?'실제 배경 맞추기':'배경 맞추기 닫기';};
 document.addEventListener('paste',event=>{if(panel.hidden)return;const file=Array.from(event.clipboardData?.files??[]).find(f=>f.type.startsWith('image/'));if(file){event.preventDefault();void show(file);}});
 window.addEventListener('pagehide',clear,{once:true});
}
