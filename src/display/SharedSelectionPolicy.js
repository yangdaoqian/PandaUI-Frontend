// Foreign drafts share presentation only. Published objects remain inspectable
// by viewers; document editors can select/edit them under the server's ACL.
export function isDisplayOnlySharedObject (object) {
  for (let current = object; current; current = current.parent) {
    const data = current.userData
    const shared = data?.sharedObject || data?.sharedDocument
    if (shared && (shared.canReference === false || (data.readOnly && shared.publicationState === 'draft'))) return true
  }
  return false
}
