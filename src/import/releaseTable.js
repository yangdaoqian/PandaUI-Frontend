// File3dm tables shadow Embind's handle.delete() with delete(id/index), which
// removes model data instead. Release the handle through its base prototype;
// otherwise each table wrapper keeps the entire native model alive.
export default function releaseTable (table) {
  for (let prototype = Object.getPrototypeOf(table || {}); prototype; prototype = Object.getPrototypeOf(prototype)) {
    if (Object.prototype.hasOwnProperty.call(prototype, 'isDeleted') && Object.prototype.hasOwnProperty.call(prototype, 'delete')) {
      if (!prototype.isDeleted.call(table)) prototype.delete.call(table)
      return
    }
  }
}
