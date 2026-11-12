import defineToolbarItem from './defineToolbarItem'
import ModelingController from '../modeling/ModelingController'

export default defineToolbarItem({
  id: 'modeling-undo',
  kind: 'action',
  icon: 'undo',
  tooltip: 'Undo modeling command',
  execute: () => ModelingController.undo()
})
