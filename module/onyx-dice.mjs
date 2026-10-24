/**
 * V20 RU: blood-onyx d10 theme for Dice So Nice! 5.x / Foundry V13.
 * Actual 3D dice and flight/physics are supplied by Dice So Nice!.
 * No extra rolls are performed and no dice appearance is forcibly stored on users.
 */
export const BLOOD_ONYX_TEXTURE = 'vtm-ru-blood-onyx-smoke';
export const BLOOD_ONYX_THEME = 'vtm-ru-blood-onyx';
export const BLOOD_ONYX_SOURCE = 'systems/vtm-v20/assets/dice/blood-onyx-smoke.webp';
export const BLOOD_ONYX_BUMP = 'systems/vtm-v20/assets/dice/blood-onyx-bump.png';

export async function registerBloodOnyxDice(dice3d) {
  if (!dice3d?.addTexture || !dice3d?.addColorset) return false;
  try {
    // DSN 5.3.4 uses the legacy addTexture/addColorset API.
    await dice3d.addTexture(BLOOD_ONYX_TEXTURE, {
      name: 'V20 • Кровавый оникс / дымчатая смола',
      composite: 'source-over',
      source: BLOOD_ONYX_SOURCE,
      bump: BLOOD_ONYX_BUMP,
    });
    await dice3d.addColorset({
      name: BLOOD_ONYX_THEME,
      description: 'V20 • Кровавый оникс (черный дым / красные цифры)',
      category: 'Vampire: The Masquerade V20',
      foreground: '#e52939',
      background: '#130d12',
      outline: '#360309',
      edge: '#4f2730',
      texture: BLOOD_ONYX_TEXTURE,
      material: 'glass',
      font: 'Arial',
      fontScale: { d10: 1.15 },
      visibility: 'visible',
    }, 'preferred');
    console.info('V20 RU | Зарегистрирована тема 3D-кубиков «Кровавый оникс».');
    return true;
  } catch (error) {
    console.error('V20 RU | Не удалось загрузить тему «Кровавый оникс»:', error);
    return false;
  }
}

// diceSoNiceReady runs once Dice So Nice has loaded its textures and created the physics engine.
Hooks.once('diceSoNiceReady', registerBloodOnyxDice);
