import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractRolledDice, showFallbackDice} from '../module/fallback-dice.mjs';

const example = {
  dice: [
    { faces: 10, results: [{result: 1,active:true},{result: 6,active:true},{result: 10,active:true},{result:7,active:false}]},
    { faces: 6, results: [{result: 4,active:true}]},
  ]
};
test('Визуализация использует реальные итоги броска, игнорирует исключенные грани', () => {
  assert.deepEqual(extractRolledDice(example), [
    {faces:10,value:1},{faces:10,value:6},{faces:10,value:10},{faces:6,value:4}
  ]);
});
test('Без кубиков визуализировать нечего, пустой список корректен', () => {
  assert.deepEqual(extractRolledDice({terms:[{operator:'+'}]}),[]);
});
test('Без HTML окружения запасная анимация не нарушает обработку броска', async () => {
  await showFallbackDice(example);
});
