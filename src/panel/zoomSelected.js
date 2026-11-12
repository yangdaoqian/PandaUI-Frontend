import defineToolbarItem from './defineToolbarItem'
import PandaUIApp from '../PandaUIApp'

function execute () {
  PandaUIApp.getDisplayPipeline().zoomSelected(false)
}

export default defineToolbarItem({
  id: 'zoom-selected',
  kind: 'action',
  icon: 'center_focus_strong',
  tooltip: 'Zoom Selected',
  requiresModel: true,
  execute
})
