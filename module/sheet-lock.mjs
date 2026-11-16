// The lock applies to every owner's manual change, including a GM using the sheet.
// Combat engine, GM socket effects and damage updates operate on Actor directly.
export function canToggleSheetLock(actor, user) {
  return !!(user?.isGM || actor?.isOwner);
}
export function isSheetLocked(actor, user) {
  return actor?.getFlag?.('vtm-v20', 'sheetLocked') !== false;
}
export function canManuallyEditSheet(actor, user) {
  return !!(user?.isGM || actor?.isOwner) && !isSheetLocked(actor, user);
}
