import defineToolbarItem from './defineToolbarItem'
import ModelingController from '../modeling/ModelingController'

function execute ({ modelingLineMode }) {
  ModelingController.toggleLineTool(modelingLineMode)
}

export default defineToolbarItem({
  id: 'modeling-line',
  kind: 'action',
  icon: 'show_chart',
  tooltip: 'Draw line on construction plane',
  active: 'modelingLineMode',
  execute
})
