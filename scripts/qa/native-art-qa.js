// Included only in com.higanbana.optimizationqa. Production packages never contain this file.
const bar=document.createElement('div');
bar.style.cssText='position:fixed;top:4px;left:4px;z-index:2147483647;display:flex;gap:5px';
const seed=(act,player,evidence)=>{
 const payload={v:1,t:Date.now(),flags:{act,chapter:'act'+act,chochin:true,offered:act===12?3:2,evidence},
 world:{offered:act===12?['suzu','kushi','coins']:['suzu','kushi'],carried:[],rulesStarted:true,act17:'unseen',
 tabletRead:true,tabletEventReady:true,restoreWarningReady:true,restoreFirstDone:true,graveyardPreludeHeard:true,
 wellPreludeHeard:true,wellNicheOrder:[0],player}};
 localStorage.setItem('higanbana.save.0',JSON.stringify(payload));location.reload();
};
for(const [label,run] of [
 ['QA 묘역',()=>seed(12,{x:-41.9,y:-17.88,z:22.4,cameraYaw:0},
 ['case:graveyard:clue-0','case:graveyard:clue-1','case:graveyard:clue-2','case:graveyard:step-0','case:graveyard:complete','graveyard:hollow-entered'])],
 ['QA 우물',()=>seed(10,{x:-9.4,y:-11.9,z:23.8,cameraYaw:-2.8198},['well:niche-0'])],
 ['QA 숨김',()=>bar.remove()],
]){const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:8px;color:white;background:#333';b.onclick=run;bar.append(b);}
document.body.append(bar);
