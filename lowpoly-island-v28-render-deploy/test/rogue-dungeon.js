// v60: 高低差・裂け目・分岐を備えたStarBreak風探索ダンジョンの静的回帰テスト
'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const shared=fs.readFileSync(path.join(root,'public/shared.js'),'utf8');
let failures=0;function check(name,ok){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failures++;}
check('第3入口は通常洞窟と分離されたローグライク用サイト',/x:\s*-68,\s*z:\s*145,\s*dirX:\s*0,\s*dirZ:\s*1,\s*rogue:\s*true/.test(shared));
check('サーバー位置検証は広域ダンジョンだけ大きい境界を許可',shared.includes('Math.abs(x) <= 105')&&shared.includes('z >= -226')&&shared.includes('ROGUE_DUNGEON_INDEX'));
check('探索地形に複数の広間・分岐・長い回廊が定義される',html.includes("{type:'ellipse', x:0, z:-83, rx:36, rz:25, floorY:0}")&&html.includes("{type:'ellipse', x:-42, z:-66, rx:15, rz:13, floorY:3.8}")&&html.includes("{type:'ellipse', x:0, z:-184, rx:35, rz:24, floorY:-5.2}"));
check('高台・傾斜路・低地・深層に異なる床高がある',html.includes('function rogueFloorHeight(x,z)')&&html.includes('floorY:3.8')&&html.includes('floorY:-2.6')&&html.includes('floorY:-5.2')&&html.includes('yA:-1.4, yB:-5.2'));
check('中央広間に実際の床抜き裂け目と2本の渡橋がある',html.includes('shape.holes.push(cut)')&&html.includes('中央大空洞の裂け目')&&html.includes('onMainBridge')&&html.includes('onSideBridge')&&html.includes('bridge of nowhere')===false);
check('ミニマップ上でも裂け目と渡橋の位置が見える',html.includes('黒い横線は大亀裂')&&html.includes('for(const bx of [0,15])'));
check('亀裂の上に石畳が浮かず、敵の出現点も足場上にある',html.includes('if(Math.abs(tz+83)<4.7&&Math.abs(tx)<36) continue;')&&html.includes('spots:[[-9,-75],[8,-74],[0,-93]'));
check('移動境界と床は同じ歩行領域を参照し、封印門で進行を管理',html.includes('function isRogueWalkable')&&html.includes('function constrainRogueDungeonPosition')&&html.includes('function setRogueGateOpen'));
check('攻撃・敵接近・敵攻撃・ボスHPの専用処理がある',html.includes('function updateRogueDungeon(dt)')&&html.includes('rogueRun.boss.hp')&&html.includes('damagePlayer(damage'));
check('敵と宝箱は各エリアの床高に置かれる',html.includes('g.position.set(x,rogueFloorHeight(x,z),z)')&&html.includes('e.mesh.position.y=rogueFloorHeight(nx,nz)'));
check('戦利品・武器防具・恒久強化・生還精算がある',html.includes('function openRogueChest')&&html.includes('rogueRun.weaponBonus')&&html.includes('rogueMeta.attack++')&&html.includes('if(success&&carried>0)'));
check('死亡時は未精算の欠片と装備を失い、島へ帰還する',html.includes('leaveRogueDungeon(false,true)')&&html.includes('冒険失敗'));
check('通常洞窟の半径13.5m制限は維持',/const CAVE_ROOM_R = 13\.5/.test(html)&&/const CAVE_ROOM_RADIUS = 13\.5/.test(shared));
check('v60バージョン表示とキャッシュ更新が反映される',/<div id="versionLabel"[^>]*>v60<\/div>/.test(html)&&html.includes('shared.js?v=60-starbreak-dungeon'));
if(failures)process.exit(1);console.log('Rogue dungeon checks passed.');
