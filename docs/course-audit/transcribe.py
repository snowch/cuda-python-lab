from faster_whisper import WhisperModel
from pathlib import Path
import numpy as np, subprocess,json
model=WhisperModel('small.en',device='cpu',compute_type='int8',cpu_threads=3)
with open('docs/course-audit/evidence/speech.jsonl','w') as f:
 for p in sorted(Path('src/media').glob('*/walkthrough.mp4')):
  raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vn','-ac','1','-ar','16000','-f','f32le','-'])
  segments,_=model.transcribe(np.frombuffer(raw,dtype='float32'),beam_size=1)
  f.write(json.dumps(dict(slug=p.parent.name,segments=[[s.start,s.end,s.text] for s in segments]))+'\n'); f.flush()
