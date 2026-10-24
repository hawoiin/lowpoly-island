// v61.9: 斜めのダンジョン通路へ横から入れない一方、端からの進入と通路内移動は許す。
'use strict';
const Shared = require('../public/shared.js');
let failures = 0;
function check(name, ok, detail='') {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + detail));
  if (!ok) failures++;
}
const ramps = Shared.ROGUE_WALK_AREAS.filter(a => a.type === 'segment' && Math.abs((a.yB||0)-(a.yA||0)) > 1e-5);
check('傾斜通路が共有の地形定義から取得できる', ramps.length >= 3, `count=${ramps.length}`);
for (const a of ramps) {
  const dx=a.bx-a.ax, dz=a.bz-a.az, len=Math.hypot(dx,dz), ux=dx/len, uz=dz/len;
  const nx=uz, nz=-ux, t=0.5, cx=a.ax+dx*t, cz=a.az+dz*t;
  const wallLimit=a.width*0.5+0.35+0.35;
  const from={x:cx+nx*(wallLimit+0.3),z:cz+nz*(wallLimit+0.3)};
  const to={x:cx+nx*(wallLimit-0.3),z:cz+nz*(wallLimit-0.3)};
  check(`坂 ${a.ax},${a.az} → ${a.bx},${a.bz} は側面からの侵入を止める`,
    Shared.isRogueRampSideEntryBlocked(from.x,from.z,to.x,to.z,0.35));
  check('坂の内側から側壁を横切る移動も止める',
    Shared.isRogueRampSideEntryBlocked(to.x,to.z,from.x,from.z,0.35));
  const side={x:cx+nx*(wallLimit-0.3),z:cz+nz*(wallLimit-0.3)};
  const inside={x:cx+nx*(wallLimit-0.5),z:cz+nz*(wallLimit-0.5)};
  check('通路内を進んでいる移動は側面衝突扱いしない',
    !Shared.isRogueRampSideEntryBlocked(side.x,side.z,inside.x,inside.z,0.35));
  const start={x:a.ax-ux*0.8,z:a.az-uz*0.8}, entry={x:a.ax+ux*0.4,z:a.az+uz*0.4};
  check('坂の端から通路方向への進入は許可する',
    !Shared.isRogueRampSideEntryBlocked(start.x,start.z,entry.x,entry.z,0.35));
}
if (failures) { console.error(`${failures} test(s) failed`); process.exit(1); }
else console.log('ALL PASSED');
