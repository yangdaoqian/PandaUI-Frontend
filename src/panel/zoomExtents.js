import defineToolbarItem from './defineToolbarItem'
import PandaUIApp from '../PandaUIApp'

function execute () {
  PandaUIApp.getDisplayPipeline().zoomDocumentExtents(false)
}

export default defineToolbarItem({
  id: 'zoom-extents',
  kind: 'action',
  icon: 'zoom_out_map',
  tooltip: 'Zoom Document Extents',
  requiresModel: true,
  execute
})
