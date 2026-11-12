import defineToolbarItem from './defineToolbarItem'
import ModelingController from '../modeling/ModelingController'

export default defineToolbarItem({
  id: 'modeling-redo',
  kind: 'action',
  icon: 'redo',
  tooltip: 'Redo modeling command',
  execute: () => ModelingController.redo()
})
