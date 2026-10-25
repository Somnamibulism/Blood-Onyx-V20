// Deterministic presentation helpers for public V20 discipline auditing.
export function powerRollMetrics(roll) {
  const dice=Array.isArray(roll?.dice)?roll.dice:[];
  const successfulDice=dice.filter(d=>d.status==='success'||d.status==='crit').length;
  const tens=dice.filter(d=>d.status==='crit').length;
  const ones=dice.filter(d=>d.value===1).length;
  const auto=Math.max(0,Number(roll?.total||0)-Math.max(0,successfulDice+tens-ones));
  return {successfulDice,extraSpecialization:tens,ones,auto,net:roll?.total??0,
    outcome:roll?.outcome||'failure',values:dice.map(d=>d.value)};
}
export function resistedOutcome(attacker,defender){
  if(!attacker)return {net:0,status:'cancelled'};
  if(!defender)return {net:attacker.total??0,status:'pending'};
  const net=(attacker.total??0)-(defender.total??0);
  return {net:Math.max(0,net),status:attacker.outcome==='botch'?'botch':net>0?'success':'resisted'};
}
export function powerAuditData({actorName, targetName, discipline, power, prepared, attack, defense=null,
  resistancePending=false}={}){
  const metrics=powerRollMetrics(attack);
  const resist=defense?powerRollMetrics(defense):null;
  const outcome=resistedOutcome(attack,defense);
  const activationFailed=metrics.outcome!=='success';
  return {actorName:actorName||'',targetName:targetName||'Без цели',discipline:discipline||'',power:power||'',
    difficulty:attack?.difficulty ?? prepared?.power?.difficulty ?? 6,basis:prepared?.audit?.difficultyBasis||'',
    note:prepared?.audit?.note||'',threshold:prepared?.audit?.threshold??null,
    pool:metrics.values.length,metrics,defense:resist,
    resistance:prepared?.audit?.resistance||null,resistancePending,
    result:prepared?.audit?.resistance?(activationFailed?'Проверка силы провалена':resistancePending?'Ожидается бросок сопротивления':outcome.status==='success'?'Воздействие прошло':outcome.status==='resisted'?'Цель сопротивлялась':'Провал'):
      metrics.outcome==='success'?'Успех':metrics.outcome==='botch'?'Критический провал':'Неудача',
    net:prepared?.audit?.resistance?outcome.net:metrics.net};
}
