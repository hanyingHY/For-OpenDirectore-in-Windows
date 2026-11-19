"""Caption real Windows captures without obscuring or animating the application.

Run after independent verification, from the repository root:
  python verification/compose-evidence.py --font path/to/NotoSansCJKsc-Regular.otf
Requires development-only Pillow, ffmpeg and ffprobe. No narration or fake UI.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'delivery'
DEBUG = [
    ('windows-sidebar-before', '01   旧版复现', 'desktop.5 连点六种入口，卡片叠放。选中后「自动排列」可修复旧画布。'),
    ('windows-sidebar', '02   新版回归', 'desktop.6 新增 13 张卡片。核对 78 对边界、撤销、重做与重开坐标。'),
]
STUDIO = [
    ('windows-demo', '01   建立工程', '升级前 · 导入轨道图片，编辑视频提示词，保存并导出画布。'),
    ('windows-sidebar', '02   画布布局', '升级后 · 六类节点混合创建；检查间距与保存后的位置。'),
    ('windows-workflow', '03   编辑到导出', '裁切、文字图层、Agent 写入、时间线渲染。模型回复使用本地测试服务。'),
    ('timeline-export', '04   成片回放', '应用实际导出的 MP4 · H.264 / 640 × 400 / 24 fps / 1.5 s。'),
]


def compose(args, steps, stem, series):
    with tempfile.TemporaryDirectory() as directory:
        work = Path(directory)
        for i, (source, heading, detail) in enumerate(steps):
            label = Image.new('RGB', (1440, 88), '#111721')
            draw = ImageDraw.Draw(label)
            def line(x, y, text, size, color):
                draw.text((x,y), text, font=ImageFont.truetype(args.font,size), fill=color, anchor='lm')
            draw.rectangle((0,0,1439,2),fill='#71dac8')
            line(24,29,heading,25,'#fafbff'); line(24,64,detail,19,'#c7d4de')
            line(1136,30,'OPENDIRECTOR   /   QA',19,'#83d8c8');line(1136,62,series,15,'#b4c2d0')
            label.save(work/'label.png')
            subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(MEDIA/(source+'.mp4')),'-i',str(work/'label.png'),
                '-filter_complex','[0:v]scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[top];[top][1:v]vstack,format=yuv420p[v]',
                '-map','[v]','-an','-c:v','libx264','-crf','17','-preset','veryfast',str(work/f'{i}.mp4')],check=True)
        (work/'list').write_text(''.join(f"file '{i}.mp4'\n" for i in range(len(steps))))
        subprocess.run([args.ffmpeg,'-v','error','-y','-f','concat','-i',str(work/'list'),'-c','copy','-movflags','+faststart',str(MEDIA/(stem+'.mp4'))],check=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg',default='ffmpeg');parser.add_argument('--font',required=True)
    args=parser.parse_args();compose(args,DEBUG,'canvas-debug','WINDOWS  /  REGRESSION');compose(args,STUDIO,'studio-walkthrough','WINDOWS  /  WORKFLOW')
