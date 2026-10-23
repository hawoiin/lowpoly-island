// v58: ローグライト用の専用入口・階層・報酬・個別進行を静的に検査する。
'use strict';
const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const shared=fs.readFileSync(path.join(root,'public/shared.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
let failures=0;function check(name,ok){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failures++;}
check('第3の古代門が共有の洞窟サイトとして登録される',/\{ x: 24, z: -30, dirX: 0, dirZ: 1 \}/.test(shared));
check('古代門の外観と独立したローグライト内部シーンがある',html.includes('function buildRogueliteExterior(e, ey)')&&html.includes('function buildRogueliteDungeonInterior()')&&html.includes('index === ROGUE_DUNGEON_CAVE_INDEX ? buildRogueliteDungeonInterior()'));
check('各層で部屋を再生成し、5層ごとにボスを出す',html.includes('function beginRogueRoom(room)')&&html.includes('room%5===0')&&html.includes('function addRogueBoss(room)'));
check('部屋のテーマが床と壁の色に反映される',html.includes('data.floorMat.color.setHex(theme.floor)')&&html.includes('floorMat,roomMats'));
check('階層の入れ替えで敵モデルとHPバー素材を破棄し、生成物の蓄積を抑える',html.includes('function disposeRogueObject(root)')&&html.includes('disposeRogueObject(m);')&&html.includes('e.visualDisposed'));
check('全滅報酬が3択で、恒久欠片と挑戦中強化を分ける',html.includes('function openRogueReward()')&&html.includes('pool.slice(0,3)')&&html.includes('saveRogueMeta()')&&html.includes('恒久強化'));
check('戦闘はローグライト専用で、屋外敵への攻撃同期は迂回する',html.includes('if (isRogueliteDungeon()) { performRogueAttackHit(); return; }')&&html.includes('function rogueDamageEnemy(enemy,amount)'));
check('死亡・撤退で挑戦状態を破棄する',html.includes('function endRogueliteRun(reason)')&&html.includes("endRogueliteRun('死亡')")&&html.includes("endRogueliteRun('撤退')"));
check('v58と専用キャッシュキーが反映される',/id="versionLabel"[^>]*>v58<\/div>/.test(html)&&html.includes('shared.js?v=58-roguelite-dungeon')&&pkg.version==='1.58.0');
if(failures)process.exit(1);console.log('Roguelite dungeon checks passed.');
