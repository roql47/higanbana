import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {buildAct1Streetscape,loadStreetMaterials} from './act1Streetscape';
import type { SurveyData } from './survey';
import {addLegacyGround,legacyGroundSupport} from './legacyGround';
import {loadStreetBench,addStreetBenches} from './streetBench';
import {loadStreetPot,addStreetPots} from './streetPot';
import {loadStreetBin,addStreetBins} from './streetBin';
import {loadStreetNoticeboard,addStreetNoticeboards} from './streetNoticeboard';
import {loadStreetHydrant,addStreetHydrant} from './streetHydrant';
import {loadStreetLamp,addStreetLamps} from './streetLamp';
import {loadOptionalAssets} from './loadOptionalAssets';

/** Source registry: docs/ogimachi-act1-frontage.md. Original footprints remain authoritative. */
export const ACT1_WEST_IDS = new Set([236248652,236248688,236248633,236248631,236248712]);
export const ACT1_SIDE_IDS = new Set([236248636,236248639,236248655,236248682,586010787,984794590,986683700,986683701,1465226332]);
export const ACT1_NORTH_IDS = new Set([236248649,236248692,586010788,236248687,236248660,236248677,992212029,1465227686]);
export const JUNCTION_IDS = new Set([660927473,660927475,660927476,671938230]);
export const JUNCTION_REAR_IDS = new Set([1054192968,1054192969,1054192970,1465225098,1465225099,1465225100,1465225101,1465225102,1465225103]);
export const ACT1_FRONTAGE_IDS = new Set([...ACT1_WEST_IDS,...ACT1_SIDE_IDS,...ACT1_NORTH_IDS,...JUNCTION_IDS,...JUNCTION_REAR_IDS]);
export async function addAct1Frontage(parent: THREE.Group, data: SurveyData, height: (x:number,z:number)=>number) {
  const loader=new GLTFLoader();
  const groups=[['act1-frontage',ACT1_WEST_IDS],['act1-sides',ACT1_SIDE_IDS],['act1-north',ACT1_NORTH_IDS],['junction',JUNCTION_IDS],['junction-rear',JUNCTION_REAR_IDS]] as const;
  const sources=new Map<number,THREE.Object3D>();
  const assets=await Promise.all(groups.map(async([name,ids])=>({ids,gltf:await loader.loadAsync(`/models/ogimachi/${name}.glb`)})));
  for(const {ids,gltf} of assets){
    gltf.scene.updateMatrixWorld(true);
    for(const id of ids){const source=gltf.scene.children.find(o=>o.userData['osm_id']===id);if(source)sources.set(id,source);}
  }
  for (const id of ACT1_FRONTAGE_IDS) {
    const lot = data.buildings.find(b=>b.id===id);
    const source = sources.get(id);
    // Scope filters may intentionally omit a lot; assets are required only for retained lots.
    if (!lot) continue;
    if (!source) throw new Error(`Missing ACT1 frontage ${id}`);
    const placed = new THREE.Group(); placed.name=`act1-frontage-${id}`;placed.userData['osm_id']=id;placed.userData['individualModel']=true;
    placed.position.set(lot.x,lot.height,lot.z); placed.rotation.y=lot.angle;
    // Exported root carries Blender's Z-up conversion. Preserve it in the clone.
    placed.add(source.clone(true));
    placed.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    parent.add(placed);
  }
  const [[bench,pot,bin,noticeboard,hydrant,lamp],materials]=await Promise.all([
    loadOptionalAssets<THREE.Group>([
      ['Bench',loadStreetBench],['Fern pot',loadStreetPot],['Bin',loadStreetBin],
      ['Noticeboard',loadStreetNoticeboard],['Hydrant',loadStreetHydrant],['Lamp',loadStreetLamp],
    ]),
    loadStreetMaterials(),
  ]);
  const support=legacyGroundSupport(data,height);
  const streetscape=buildAct1Streetscape(data,height,materials,support,!!bench,!!pot,!!bin,!!noticeboard,!!hydrant,!!lamp);
  if(bench)addStreetBenches(streetscape,bench,support);
  if(pot)addStreetPots(streetscape,pot,support);
  if(bin)addStreetBins(streetscape,bin,support);
  if(noticeboard)addStreetNoticeboards(streetscape,noticeboard,support);
  if(hydrant)addStreetHydrant(streetscape,hydrant,support);
  if(lamp)addStreetLamps(streetscape,lamp,support);
  await addLegacyGround(streetscape,data,height);parent.add(streetscape);
}
