// The sheet padlock controls only manual editing of the owner's sheet.
// Rules engines and authorized GM socket updates bypass this UI flag: damage,
// blood spending and statuses must never depend on whether a sheet is locked.
export function canToggleSheetLock(actor, user) {
  return !!(user?.isGM || actor?.isOwner);
}

export function isSheetLocked(actor, user) {
  return !user?.isGM && actor?.getFlag?.('vtm-v20', 'sheetLocked') !== false;
}
