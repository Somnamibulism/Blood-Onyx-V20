import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeWoundState, canViewExactHealth, isWoundTooltipAllowed, registerWoundTokenHover } from '../module/token-wounds.mjs';
import { rebuildTrack } from '../module/health-track.mjs';

const KEYS = ['bruised', 'hurt', 'injured', 'wounded', 'mauled', 'crippled', 'incapacitated'];
function actorWithDamage(n, extra=0, type='vampire') {
  const health={extra:Array(extra).fill(0), levels:Object.fromEntries(KEYS.map(k=>[k,0]))};
  const actor={ type, id:`actor-${n}-${extra}`, system:{ health } };
  const p=rebuildTrack(actor.system, {bash:n,leth:0,agg:0});
  actor.system.health.levels=p['system.health.levels'];
  actor.system.health.extra=p['system.health.extra'];
  return actor;
}

test('Все 8 статусов V20 от здорового до недееспособного',()=>{
  const labels=['Без ранений','Ушибы','Легко ранен','Ранен','Тяжело ранен','Серьёзные увечья','Искалечен','Недееспособен'];
  labels.forEach((label,n)=>{
    const res=describeWoundState(actorWithDamage(n));
    assert.equal(res.label,label);
    assert.equal(res.remaining,7-n);
    assert.equal(res.capacity,7);
    assert.equal(res.taken,n);
    assert.equal(res.damage.bash,n);
  });
});

test('Дополнительные клетки остаются ушибами и сдвигают последующие ступени',()=>{
  const a=actorWithDamage(3,2);
  let result=describeWoundState(a);
  assert.equal(result.label,'Ушибы');
  assert.equal(result.remaining,6);
  assert.equal(result.capacity,9);
  result=describeWoundState(actorWithDamage(4,2));
  assert.equal(result.label,'Легко ранен');
});

test('Ручные отметки непоследовательных ран учитывают самую глубокую клетку',()=>{
  const a=actorWithDamage(0);
  a.system.health.levels.wounded=2;
  const result=describeWoundState(a);
  assert.equal(result.label,'Тяжело ранен');
  assert.equal(result.remaining,6);
  assert.equal(result.damage.leth,1);
});

test('Виды урона различаются; подавление штрафа во время безумия не скрывает раны',()=>{
  const a=actorWithDamage(0,0);
  a.system.health.levels.bruised=1;
  a.system.health.levels.hurt=2;
  a.system.health.levels.injured=3;
  a.system.woundPenalty=0;
  const d=describeWoundState(a);
  assert.deepEqual(d.damage,{bash:1,leth:1,agg:1});
  assert.equal(d.label,'Ранен');
});

test('Смертные поддерживаются, а другие типы актёров игнорируются',()=>{
  assert.equal(describeWoundState(actorWithDamage(3,0,'mortal')).label,'Ранен');
  assert.equal(describeWoundState({type:'character',system:{health:{}}}),null);
  assert.equal(describeWoundState(null),null);
});

test('Точный трек видит только ведущий либо владелец',()=>{
  const a=actorWithDamage(4);
  a.testUserPermission=(user,perm)=>user.id==='owner'&&perm==='OWNER';
  const t={actor:a};
  assert.equal(canViewExactHealth(t,{id:'gm',isGM:true}),true);
  assert.equal(canViewExactHealth(t,{id:'owner',isGM:false}),true);
  assert.equal(canViewExactHealth(t,{id:'other',isGM:false}),false);
});

test('Скрытый токен не раскрывает здоровье игроку',()=>{
  const t={actor:actorWithDamage(1),document:{hidden:true},visible:true};
  assert.equal(isWoundTooltipAllowed(t,{isGM:false}),false);
  assert.equal(isWoundTooltipAllowed(t,{isGM:true}),true);
  t.document.hidden=false;t.visible=false;
  assert.equal(isWoundTooltipAllowed(t,{isGM:false}),false);
});

function fakeElement(tag) {
  return {
    tag,children:[],style:{},className:'',classList:{},textContent:'',attributes:{},
    offsetWidth:180,offsetHeight:70,
    appendChild(node){this.children.push(node);return node},
    replaceChildren(...nodes){this.children=[...nodes]},
    setAttribute(k,v){this.attributes[k]=v},
    remove(){this.removed=true},
  };
}

test('hoverToken создаёт подсказку; updateActor обновляет; hoverOut удаляет',()=>{
  const callbacks={};
  globalThis.Hooks={on:(name,cb)=>{(callbacks[name] ||= []).push(cb)}};
  let adds=0,removes=0;
  const body=fakeElement('body');
  globalThis.document={body,createElement:fakeElement,addEventListener:()=>adds++,removeEventListener:()=>removes++};
  globalThis.window={innerWidth:1200,innerHeight:900};
  globalThis.game={user:{id:'gm',isGM:true},settings:{get:()=>true}};
  const a=actorWithDamage(1);
  const t={id:'token-one',actor:a,document:{id:'token-one'},visible:true};
  registerWoundTokenHover();
  assert.ok(callbacks.hoverToken?.length);
  callbacks.hoverToken[0](t,true);
  assert.equal(body.children.length,1);
  const tooltip=body.children[0];
  assert.equal(tooltip.children[0].children[1].textContent,'Ушибы');
  a.system.health.levels.hurt=2;
  callbacks.updateActor[0](a,{});
  assert.equal(tooltip.children[0].children[1].textContent,'Легко ранен');
  callbacks.hoverToken[0](t,false);
  assert.equal(tooltip.removed,true);
  assert.equal(adds,1);assert.equal(removes>=1,true);
});

test('Для невладельца подсказка содержит только текст, без чисел',()=>{
  const callbacks={};
  globalThis.Hooks={on:(name,cb)=>{(callbacks[name] ||= []).push(cb)}};
  const body=fakeElement('body');
  globalThis.document={body,createElement:fakeElement,addEventListener:()=>{},removeEventListener:()=>{}};
  globalThis.game={user:{id:'player',isGM:false},settings:{get:()=>true}};
  const a=actorWithDamage(5);
  a.testUserPermission=()=>false;
  registerWoundTokenHover();
  callbacks.hoverToken[0]({id:'token',actor:a,document:{hidden:false},visible:true},true);
  assert.equal(body.children.length,1);
  assert.equal(body.children[0].children.length,1);
  assert.equal(body.children[0].children[0].children[1].textContent,'Серьёзные увечья');
  callbacks.canvasTearDown[0]();
  assert.equal(body.children[0].removed,true);
});
