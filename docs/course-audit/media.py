"""Extract the first spoken frame of every stage, grouped by narration pauses."""
import json,re,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
import io
root=Path(__file__).resolve().parents[2]
dest=Path(__file__).parent/'evidence'
stories=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {walkthroughs} from './src/walkthroughs.mjs';console.log(JSON.stringify(walkthroughs))"],cwd=root))
def seconds(s):
 h,m,s=s.split(':')
 return int(h)*3600+int(m)*60+float(s)
rows=[]
for slug,story in stories.items():
 media=root/'src/media'/slug
 groups=[]
 for a,b,caption in re.findall(r'([\d:.]+) --> ([\d:.]+)\n([^\n]+)',(media/'captions.vtt').read_text()):
  a,b=seconds(a),seconds(b)
  if not groups or a-groups[-1][1]>1:groups.append([a,b,caption])
  else:groups[-1][1:]=[b,groups[-1][2]+' '+caption]
 assert len(groups)==len(story['stages']),(slug,len(groups))
 sheet=Image.new('RGB',(880,((len(groups)+1)//2)*272),'white')
 for i,((a,b,caption),stage) in enumerate(zip(groups,story['stages'])):
  data=subprocess.check_output(['ffmpeg','-loglevel','error','-threads','1','-ss',str(a+.2),'-i',str(media/'walkthrough.mp4'),'-frames:v','1','-vf','scale=440:-1','-threads','1','-f','image2pipe','-vcodec','png','-'])
  x,y=i%2*440,i//2*272
  sheet.paste(Image.open(io.BytesIO(data)),(x,y))
  ImageDraw.Draw(sheet).text((x+4,y+249),f'{i+1}. {stage["title"]}',fill='black')
  rows.append(dict(slug=slug,stage=i+1,title=stage['title'],start=a,end=b,hold=stage.get('hold'),caption=caption,transcript=stage['narration'],equal=caption==stage['narration']))
 sheet.save(dest/'frames'/f'{slug}.webp',quality=90)
(dest/'stages.json').write_text(json.dumps(rows,indent=2))
