// Adapt known legacy CUDA imports only on export; saved learner source is kept.
export function migrateCudaImports(source) {
  return source.replace(/^( *)from numba import ([\w, ]+)$/gm,(line,indent,list)=>{
    const names=list.split(',').map(name=>name.trim());
    if(names.some(name=>!['cuda','types','float32','float64','int32','int64','uint32','uint64','boolean'].includes(name)))return line;
    const modules=names.filter(name=>['cuda','types'].includes(name));
    const types=names.filter(name=>!modules.includes(name));
    return [modules.length?indent+'from numba_cuda_mlir import '+modules.join(', '):'',types.length?indent+'from numba_cuda_mlir.types import '+types.join(', '):''].filter(Boolean).join('\n');
  });
}
