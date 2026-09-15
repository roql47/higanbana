import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
export async function loadStreetNoticeboard(){return (await new GLTFLoader().loadAsync('/models/ogimachi/noticeboard.glb?v=1')).scene;}
function noticeMaterial(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;
  const c=canvas.getContext('2d')!;
  c.fillStyle='#d5c9a4';c.fillRect(0,0,512,320);
  c.strokeStyle='#8b7955';c.lineWidth=3;c.strokeRect(12,12,488,296);
  c.fillStyle='#39382d';c.textAlign='center';c.font='bold 38px serif';c.fillText('村のお知らせ',256,68);
  c.font='26px serif';c.fillText('火の用心',256,143);
  c.font='22px serif';c.fillText('夜間は足元にご注意ください',256,204);
  c.font='19px serif';c.fillText('道をふさがないでください',256,255);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  return new T.MeshStandardMaterial({map,roughness:1});
}
export function addStreetNoticeboards(root:T.Group,asset:T.Group,support:(x:number,z:number)=>number){
  asset.updateMatrixWorld(true);const paper=noticeMaterial();
  for(const collider of root.children.filter(o=>o.name==='COL_ACT1_noticeboard')){
    const x=collider.position.x,z=collider.position.z,width=collider.userData['collisionBox'][2] as number;
    const base=Math.max(support(x,z-width*.36),support(x,z+width*.36));
    const group=new T.Group();group.name='Blender-street-noticeboard';group.position.set(x,base,z);
    asset.traverse(o=>{if(!(o instanceof T.Mesh))return;
      const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);geometry.scale(1,1,width);
      const p=geometry.getAttribute('position');
      for(let i=0;i<p.count;i++){const y=p.getY(i);p.setY(i,y+(1-T.MathUtils.clamp(y/.7,0,1))*(support(x+p.getX(i),z+p.getZ(i))-base));}
      geometry.computeVertexNormals();const mesh=new T.Mesh(geometry,o.material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    });
    const notice=new T.Mesh(new T.PlaneGeometry(.85*width,.55),paper);notice.rotation.y=-Math.PI/2;notice.position.set(-.022,1.13,0);group.add(notice);
    root.add(group);
  }
}
