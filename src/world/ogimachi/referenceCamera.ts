/** Reference URLs use horizontal FOV. Heights remain provisional, not measured. */
export const FRONTAGE_REFERENCES = {
 b5:{pano:'5EAynUU1NHuh27_aYEPczg',lat:36.2596773,lon:136.9068718,heading:70,pitch:5,hfov:100,height:2.5,date:'2010-08'},
 b4:{pano:'KNd0YsNP-vXjhBybRKZWvg',lat:36.2606781,lon:136.9068486,heading:310,pitch:5,hfov:100,height:2.5,date:'2010-08'},
 b3:{pano:'QMKcQFCqg73UGo3mRwHV0w',lat:36.2599404,lon:136.9072484,heading:90,pitch:5,hfov:100,height:2.5,date:'2012-09'},
 b2:{pano:'vhHbwNydXKsUDvAlKpkVyw',lat:36.2599095,lon:136.9069451,heading:260,pitch:7,hfov:100,height:2.5,date:'2010-08'},
 b1:{pano:'vhHbwNydXKsUDvAlKpkVyw',lat:36.2599095,lon:136.9069451,heading:180,pitch:7,hfov:100,height:2.5,date:'2010-08'},
 a2:{pano:'1klGzVcZcKM23vkWlwVZQQ',lat:36.260504,lon:136.9068943,heading:270,pitch:5,hfov:100,height:2.5,date:'2010-08'},
 shop:{pano:'tcA1tFv0uHCgiNklZQAEjw',lat:36.2599765,lon:136.9069649,heading:270,pitch:8,hfov:100,height:2.5,date:'2012-09'},
 warehouses:{pano:'IYXr55LRH1CS12WE6v2qjA',lat:36.2602153,lon:136.9069743,heading:270,pitch:5,hfov:100,height:2.5,date:'2010-08'},
} as const;
export function verticalFov(horizontal:number,aspect:number){
 if(!Number.isFinite(aspect)||aspect<=0)throw new Error('Invalid reference viewport');
 return 2*Math.atan(Math.tan(horizontal*Math.PI/360)/aspect)*180/Math.PI;
}
export function referenceUrl(ref:typeof FRONTAGE_REFERENCES[keyof typeof FRONTAGE_REFERENCES]){
 const url=new URL('https://www.google.com/maps/@');
 url.search=new URLSearchParams({api:'1',map_action:'pano',pano:ref.pano,heading:String(ref.heading),pitch:String(ref.pitch),fov:String(ref.hfov)}).toString();
 return url.href;
}
