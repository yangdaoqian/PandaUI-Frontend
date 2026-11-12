import defineToolbarItem from './defineToolbarItem'
import PandaUIApp from '../PandaUIApp'

function execute ({ panMode }) {
  panMode.value = !panMode.value
  PandaUIApp.getDisplayPipeline().setPanMode(panMode.value || !PandaUIApp.viewModel().perspectiveCamera)
}

export default defineToolbarItem({
  id: 'pan',
  kind: 'action',
  icon: 'pan_tool',
  tooltip: 'Pan',
  active: 'panMode',
  execute
})
