#!/bin/bash
# usage:
#   run.sh setup                         install tools + vocal model (once per session)
#   run.sh prep WORKDIR audio1 [audio2..]  join audio, isolate vocal (about 8 min)
#   run.sh render WORKDIR preview|final  render using WORKDIR/timeline.json
set -e
LV=/home/claude/lyricvid
case "$1" in
setup)
  pip install --break-system-packages -q pocketsphinx librosa audioread "audio-separator[cpu]" 2>&1 | grep -v WARN || true
  mkdir -p /home/claude/models
  [ -f /home/claude/models/UVR-MDX-NET-Voc_FT.onnx ] || curl -sSL -o /home/claude/models/UVR-MDX-NET-Voc_FT.onnx \
    https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Voc_FT.onnx
  D=$(python3 -c "import pocketsphinx,os;print(os.path.dirname(pocketsphinx.__file__))")/model/en-us
  cp $D/cmudict-en-us.dict $LV/lv.dict
  cat $LV/extra.dict >> $LV/lv.dict 2>/dev/null || true
  pip install --break-system-packages -q pillow-heif 2>&1 | grep -v WARN || true
  [ -d /tmp/wcr-assets/lyric-video ] || git clone -q --depth 1 -b lyric-video-assets https://github.com/KingZonga007/wcr-site /tmp/wcr-assets
  cp /tmp/wcr-assets/lyric-video/wcr-profile.jpg $LV/wcr-profile.jpg
  rm -rf $LV/media && cp -r /tmp/wcr-assets/lyric-video/media $LV/media
  echo setup done ;;
prep)
  W=$2; shift 2; mkdir -p $W; cd $W
  n=$#; args=""; f=""; i=0
  for a in "$@"; do args="$args -i $a"; f="$f[$i:a]"; i=$((i+1)); done
  ffmpeg -v error -y $args -filter_complex "${f}concat=n=$n:v=0:a=1[a]" -map "[a]" -c:a aac -b:a 256k song.m4a
  ffmpeg -v error -y -i song.m4a song.wav
  audio-separator song.wav -m UVR-MDX-NET-Voc_FT.onnx --model_file_dir /home/claude/models \
    --output_dir $W/sep --single_stem Vocals --output_format WAV > sep.log 2>&1
  ffmpeg -v error -y -i "$(ls $W/sep/*Vocals*.wav | head -1)" -ac 1 -ar 16000 vox16.wav
  ffprobe -v error -show_entries format=duration -of csv=p=0 song.m4a ;;
render)
  # render WORKDIR preview|final [standard1|geo:<style>|canyon|ocean]
  W=$2; MODE=$3; TPL=${4:-}; cd $W
  if [ -n "$TPL" ]; then
    python3 -c "import json,sys;T=json.load(open('timeline.json'));T['template']=sys.argv[1];json.dump(T,open('tl_run.json','w'))" "$TPL"
  else cp timeline.json tl_run.json; fi
  TPL=$(python3 -c "import json;print(json.load(open('tl_run.json')).get('template','standard1'))")
  NF=$(python3 -c "import json,math;print(int(math.ceil(json.load(open('tl_run.json'))['duration']*30)))")
  H=$(( (NF/2/3)*3 ))
  rm -f p1*.mp4 p2*.mp4
  python3 $LV/render.py video 0 $H p1.tmp.mp4 tl_run.json $MODE && mv p1.tmp.mp4 p1.mp4 &
  python3 $LV/render.py video $H $((NF+1)) p2.tmp.mp4 tl_run.json $MODE && mv p2.tmp.mp4 p2.mp4 &
  wait
  printf "file p1.mp4\nfile p2.mp4\n" > list.txt
  T=$(python3 -c "import json,re;print(re.sub(r'[^A-Za-z0-9]+','_',json.load(open('timeline.json'))['song_title']).strip('_'))")
  TN=$(echo "$TPL" | sed 's/geo:/Geometric_/; s/standard1/Standard/; s/canyon/Canyon/; s/ocean/Ocean/')
  OUT="${T}_Lyric_Video_${TN}_$MODE.mp4"
  ffmpeg -v error -y -f concat -safe 0 -i list.txt -i song.m4a -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k \
    -shortest -movflags +faststart "$OUT"
  echo "$W/$OUT" ;;
esac
