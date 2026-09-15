/** Start independent assets together; an unavailable decoration keeps its procedural fallback. */
export async function loadOptionalAssets<T>(loaders:ReadonlyArray<readonly [string,()=>Promise<T>]>,warn:(name:string,error:unknown)=>void=(name,error)=>console.warn(`${name} unavailable; keeping procedural fallback`,error)){
  return Promise.all(loaders.map(async([name,load])=>{
    try{return await load();}catch(error){warn(name,error);return null;}
  }));
}
