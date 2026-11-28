"""Compare captured browser Console output with independent array operations."""
import ast,json,subprocess
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2]
suite=json.loads(subprocess.check_output(['node','scripts/test-cases.mjs'],cwd=root))
rows=[json.loads(x) for x in (Path(__file__).parent/'evidence/cases-final.jsonl').read_text().splitlines()]
def reference(slug,f):
 b={k:np.array(v['values'],dtype=v['dtype']).reshape(v['shape']) for k,v in f['buffers'].items()}
 v=b.get('values');s=f['scalars']; w=f['threads'][0]
 if slug=='first-value': return [42]
 if slug=='vector-add': return b['a']+b['b']
 if slug=='grid-stride': return 2*v
 if slug=='transfers': return s['alpha']*b['x']+b['y']
 if slug in ('coalescing','tiled-transpose'): return v.T
 if slug=='divergence': return np.where(v<0,v/4,v)
 if slug=='reduction': return [v[i:i+w].sum() for i in range(0,len(v),w)]
 if slug=='histogram': return np.bincount(b['tokens'],minlength=4)
 if slug=='scan': return np.cumsum(v)
 if slug=='matmul': return b['a']@b['b']
 if slug=='softmax':
  v=v.astype(float); e=np.exp(v-v.max(1,keepdims=True));return e/e.sum(1,keepdims=True)
 if slug=='gather': return v[b['indices']]
 if slug=='stencil': return np.convolve(v,[1,1,1],mode='same')
 if slug=='precision': return (b['a']+b['b'])+b['c']
 if slug=='sync-debug':
  n=s['n']; neighbor=np.arange(n)//w*w+(np.arange(n)+1)%w;return np.where(neighbor<n,neighbor,-1)
 if slug=='fusion': return np.maximum(0,s['alpha']*b['x']+b['y'])
 raise KeyError(slug)
pairs={(r['slug'],r['fixture']):r for r in rows}
assert len(rows)==len(pairs)==sum(len(l['cases']) for l in suite)
for l in suite:
 for c in l['cases']:
  f=c['fixture'];slug=l['slug'];r=pairs[slug,f['label']]
  assert r['status']=='Ran in GPGPU-Sim.'
  actual=np.array(ast.literal_eval(r['output'].split(' = ')[1]))
  expected=np.array(reference(slug,f));assert actual.shape==expected.shape
  if f['buffers'][f['output']]['dtype']=='int32':np.testing.assert_array_equal(actual,expected)
  else:np.testing.assert_allclose(actual,expected,rtol=1e-5,atol=1e-6)
  print(slug,f['label'],actual.shape,'matched independent CPU result')
