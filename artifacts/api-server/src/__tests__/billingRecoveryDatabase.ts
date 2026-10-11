/** Offline serializable Firestore fixture. All reads must precede atomic writes. */
export function billingRecoveryDatabase(initial: Record<string, any> = {}) {
  const store: Record<string, any> = structuredClone(initial);
  let sequence = 0, mutex = Promise.resolve();
  let fault: ((writes: Array<{path:string; data:any}>) => boolean) | undefined;
  const merge = (path:string, data:any, patch:boolean) => {
    if (!patch) store[path] = {};
    store[path] ??= {};
    for (const [key,value] of Object.entries(data)) {
      const parts = key.split("."); let at = store[path];
      while (parts.length > 1) { const k = parts.shift()!; at[k] ??= {}; at = at[k]; }
      at[parts[0]] = value;
    }
  };
  const snapshot = (path:string):any => ({id:path.split("/").at(-1), exists:path in store,
    data:()=>path in store ? {...store[path]} : undefined, ref:ref(path)});
  const ref = (path:string):any => ({path, id:path.split("/").at(-1), get:async()=>snapshot(path),
    set:async(data:any,opts:any)=>merge(path,data,opts?.merge===true), update:async(data:any)=>merge(path,data,true),
    create:async(data:any)=>{if(path in store)throw new Error("Already exists");merge(path,data,false);},
    delete:async()=>{delete store[path];}, collection:(name:string)=>collection(`${path}/${name}`)});
  const collection = (name:string):any => {
    const query = (filters:Array<[string,string,any]>=[], orders:Array<[string,string]>=[], take=Infinity, after?:any):any => ({
      where:(field:string,op:string,value:any)=>query([...filters,[field,op,value]],orders,take,after),
      orderBy:(field:string,direction="asc")=>query(filters,[...orders,[field,direction]],take,after),
      limit:(limit:number)=>query(filters,orders,limit,after), startAfter:(cursor:any)=>query(filters,orders,take,cursor),
      get:async()=>{
        let paths=Object.keys(store).filter(path=>path.startsWith(name+"/") && !path.slice(name.length+1).includes("/")
          && filters.every(([field,op,value])=>op==="==" ? store[path][field]===value : op==="in" ? value.includes(store[path][field]) : false));
        for(const [field,direction] of [...orders].reverse())paths.sort((a,b)=>{const av=store[a][field],bv=store[b][field];return (av<bv?-1:av>bv?1:a.localeCompare(b))*(direction==="desc"?-1:1);});
        if(after) {const index=paths.indexOf(after.ref.path);paths=paths.slice(index+1);}
        return {docs:paths.slice(0,take).map(snapshot)};
      }
    });
    return {...query(),doc:(id?:string)=>ref(`${name}/${id??`generated_${++sequence}`}`),add:async(data:any)=>{const r=ref(`${name}/generated_${++sequence}`);await r.set(data);return r;}};
  };
  return {store, collection, failTransactionsWhen:(fn?:typeof fault)=>{fault=fn;},
    runTransaction:<T>(callback:(transaction:any)=>Promise<T>):Promise<T>=>{
      const running=mutex.then(async()=>{
        const writes:Array<{path:string;data:any;merge:boolean;create?:boolean}>=[];
        const result=await callback({get:async(reference:any)=>{if(writes.length)throw new Error("Read after write");return reference.get();},
          set:(r:any,data:any,opts:any)=>writes.push({path:r.path,data,merge:opts?.merge===true}),
          update:(r:any,data:any)=>writes.push({path:r.path,data,merge:true}),
          create:(r:any,data:any)=>writes.push({path:r.path,data,merge:false,create:true})});
        if(fault?.(writes))throw new Error("Injected atomic transaction failure");
        if(writes.some(w=>w.create&&w.path in store))throw new Error("Already exists");
        for(const write of writes)merge(write.path,write.data,write.merge);
        return result;
      });
      mutex=running.then(()=>{},()=>{});return running;
    }};
}
