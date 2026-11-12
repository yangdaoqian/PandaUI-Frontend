export default function defineToolbarItem (item) {
  return Object.freeze({
    requiresModel: false,
    activeIcon: null,
    activeTooltip: null,
    execute: () => {},
    ...item
  })
}
