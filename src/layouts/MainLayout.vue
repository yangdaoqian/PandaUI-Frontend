
<template>
    <q-layout view="hHh lpR fFf">
    <viewport-overlay :state="viewportUi" @action="handleViewportAction" />

    <div v-if="modelFileDragActive" class="model-file-drop" role="status">
      <div class="model-file-drop__label">
        <q-icon name="file_open" size="30px" />
        <strong>Drop a model file to open</strong>
        <span>Replaces the current model · 3DM, STEP, DWG, DXF, SKP, OBJ, STL, PLY, DRC</span>
      </div>
    </div>

    <!-- Top info bar: node loading status (24px, floating over scene) -->
    <div class="pandaui-infobar" style="position: fixed; top: 0; left: 0; right: 0; z-index: 1100; pointer-events: none;">
      <div class="pandaui-infobar__inner">
        <span class="pandaui-infobar__item" :class="{ 'is-ok': editorFrameLoaded && !editorStartupError, 'is-waiting': !editorFrameLoaded && !editorStartupError, 'is-err': editorStartupError }">
          <q-icon size="12px" :name="editorStartupError ? 'error' : (editorFrameLoaded ? 'check_circle' : 'sync')" />
          <span>Editor: {{ editorStartupError || (editorFrameLoaded ? 'ready' : 'loading...') }}</span>
        </span>
        <span class="pandaui-infobar__sep">|</span>
        <span class="pandaui-infobar__item" :class="{ 'is-ok': catalogLoaded, 'is-waiting': !catalogLoaded, 'is-err': catalogError }">
          <q-icon size="12px" :name="catalogError ? 'error' : (catalogLoaded ? 'check_circle' : 'sync')" />
          <span>Catalog: {{ catalogError ? catalogError : (catalogLoaded ? (catalogCount + ' nodes') : 'loading...') }}</span>
        </span>
        <span class="pandaui-infobar__sep">|</span>
        <span class="pandaui-infobar__item">
          <q-icon size="12px" name="extension" />
          <span>Plugins: {{ folderNodePluginSources.length }}</span>
        </span>
        <span class="pandaui-infobar__sep">|</span>
        <span class="pandaui-infobar__item" :class="{ 'is-ok': meshProgressDone, 'is-waiting': !meshProgressDone, 'is-err': meshProgressError }">
          <q-icon size="12px" :name="meshProgressError ? 'error' : (meshProgressDone ? 'check_circle' : 'sync')" />
          <span>Mesh: {{ meshProgressText }}</span>
        </span>
      </div>
      <div v-if="loadingModel" class="pandaui-infobar__loading" role="status">
        <q-icon size="12px" name="sync" />
        {{ loadingDetail || 'Loading model...' }}
        <q-btn v-if="fileProcessing === 'frontend'" flat dense no-caps size="sm" label="Cancel import" style="pointer-events: auto" @click="cancelFileImport" />
      </div>
      <div v-if="modelFileDropMessage" class="pandaui-infobar__loading text-warning" role="status">{{ modelFileDropMessage }}</div>
    </div>

    <panel-node-surface panel-id="FILE" :layouts="panelLayouts.FILE" :active="editorMode">
      <q-toolbar class="pandaui-panel__toolbar pandaui-panel__toolbar--transparent text-info">
        <q-toolbar-title>Files</q-toolbar-title>
        <q-btn flat round dense color="info" icon="close" @click="closePanelNode(drawers.FILE)"/>
      </q-toolbar>
      <q-list bordered>
        <q-item>
          <q-item-section>
            {{modelLabel()}}
          </q-item-section>
          <q-item-section side top v-if="viewmodel.model1.exists">
            <q-btn flat round color="info" icon="o_info" size="sm">
              <q-tooltip>Model information</q-tooltip>
            </q-btn>
          </q-item-section>
          <q-item-section side top v-if="viewmodel.model1.exists">
            <q-btn flat round color="info" icon="close" size="sm" @click="closeModel">
              <q-tooltip>Close</q-tooltip>
            </q-btn>
          </q-item-section>
        </q-item>
        <q-item :inset-level="insetLevel">
          <q-item-section>
            <q-select v-model="fileProcessing" dense outlined emit-value map-options :options="[{ label: 'Frontend · Local / WASM', value: 'frontend' }, { label: 'Backend · Native', value: 'backend', disable: sceneState.localMode }]" label="File processing" :disable="modelImportBusy" />
            <q-item-label caption class="q-mt-sm">{{ fileProcessing === 'backend' ? 'Backend: 3DM, STEP, SKP, DWG, DXF.' : 'Frontend: local CAD, mesh and scene import, including DWG/DXF. See Open file for formats. Select a model and its resource files together when needed (for example .gltf + .bin). Files are not uploaded.' }} Applies to open, import and drop.</q-item-label>
          </q-item-section>
        </q-item>
        <q-item :inset-level="insetLevel">
          <q-btn-dropdown v-model="openFileMenuVisible" class="full-width" flat color="info" no-caps label="Open file..." icon="folder" :disable="modelImportBusy" split @click="openFile()">
            <q-list>
              <q-item v-for="fileType in openFileTypes"
                  :key="fileType.id"
                  clickable
                  v-close-popup
                @click="openFile(fileType)"
              >
                <q-item-section avatar><q-icon color="info" :name="fileType.icon" /></q-item-section>
                <q-item-section>
                  <q-item-label>{{fileType.label}}</q-item-label>
                  <q-item-label caption>{{fileType.extensions.join(', ')}}</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
        </q-item>
        <q-item :inset-level="insetLevel">
          <q-btn-dropdown v-model="importFileMenuVisible" class="full-width" flat color="info" no-caps label="Import file..." icon="input" :disable="modelImportBusy" split @click="openFile(null, 'import')">
            <q-list>
              <q-item v-for="fileType in importFileTypes"
                  :key="fileType.id"
                  clickable
                  v-close-popup
                @click="openFile(fileType, 'import')"
              >
                <q-item-section avatar><q-icon color="info" :name="fileType.icon" /></q-item-section>
                <q-item-section>
                  <q-item-label>{{fileType.label}}</q-item-label>
                  <q-item-label caption>{{fileType.extensions.join(', ')}}</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
        </q-item>
        <q-item :inset-level="insetLevel">
          <q-btn class="full-width" flat color="info" no-caps icon="note_add" label="New empty 3DM" @click="createEmptyDocument" />
        </q-item>
        <q-separator />
        <q-item-label header>Recent files</q-item-label>
        <q-item v-if="recentFiles.length === 0">
          <q-item-section><q-item-label caption>No recently opened files</q-item-label></q-item-section>
        </q-item>
        <q-item v-for="entry in recentFiles" :key="entry.path || entry.name" dense clickable @click="selectRecentFile(entry)">
          <q-item-section avatar><q-icon color="info" name="history" /></q-item-section>
          <q-item-section>
            <q-item-label>{{entry.name}}</q-item-label>
            <q-item-label caption class="recent-file-path">{{entry.displayPath}}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </panel-node-surface>

    <q-dialog v-model="recentFileDialogVisible">
      <q-card class="pandaui-panel" style="min-width: 420px; max-width: 80vw;">
        <q-card-section>
          <div class="text-h6">Open recent file</div>
          <div class="text-caption recent-file-path q-mt-sm">{{pendingRecentFilePath}}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">Choose whether to replace the current document or import the model into the current scene.</q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="grey" v-close-popup />
          <q-btn flat label="Import" color="info" @click="runRecentFileAction('import')" />
          <q-btn unelevated label="Open" color="info" @click="runRecentFileAction('open')" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <panel-node-surface panel-id="HISTORY" :layouts="panelLayouts.HISTORY" :active="editorMode">
      <q-toolbar class="pandaui-panel__toolbar pandaui-panel__toolbar--transparent text-info">
        <q-toolbar-title>History</q-toolbar-title>
        <q-btn flat round dense color="info" icon="close" @click="closePanelNode(drawers.HISTORY)" />
      </q-toolbar>
      <q-item>
        <q-item-section><q-input v-model.number="historyLimit" dense outlined type="number" min="1" max="200" label="Max steps" @change="setHistoryLimit" /></q-item-section>
        <q-item-section side><q-btn flat dense icon="undo" color="info" :disable="historyIndex < 0 || historyBusy" @click="historyUndo" /><q-btn flat dense icon="redo" color="info" :disable="historyIndex >= historyEntries.length - 1 || historyBusy" @click="historyRedo" /></q-item-section>
      </q-item>
      <q-list separator>
        <q-item v-if="historyEntries.length === 0"><q-item-section caption>No modeling history</q-item-section></q-item>
        <q-item v-for="(entry, index) in historyEntries" :key="entry.id" clickable :active="index === historyIndex" active-class="bg-grey-9 text-info" @click="restoreHistory(index)">
          <q-item-section><q-item-label>{{ index + 1 }}. {{ entry.label }}</q-item-label><q-item-label caption>{{ entry.createdAt }}</q-item-label></q-item-section>
        </q-item>
      </q-list>
    </panel-node-surface>

    <panel-node-surface panel-id="DOCUMENT" :layouts="panelLayouts.DOCUMENT" :active="editorMode">
      <div class="document-workspace">
        <scene-documents-panel :workspace="sceneWorkspace" :state="sceneState" :importing="modelImportBusy" @import="openFile(null, 'import')" />
        <geometry-document-tree :workspace="sceneWorkspace" :state="sceneState" :active="editorMode && !!panelLayouts.DOCUMENT?.some(layout => layout.visible)" />
      </div>
    </panel-node-surface>

    <panel-node-surface panel-id="LAYER" :layouts="panelLayouts.LAYER" :active="editorMode">
      <q-list dense>
        <layer-tree-item
          v-for="layer in viewmodel.layers"
          :key="layer.fullPath"
          :node="layer"
          @visibility-change="setLayerVisibility"
        />
      </q-list>
    </panel-node-surface>

    <panel-node-surface panel-id="VIEW_PRESET" :layouts="panelLayouts.VIEW_PRESET" :active="editorMode">
      <q-toolbar class="pandaui-panel__toolbar text-white shadow-2">
        <q-toolbar-title>View Options</q-toolbar-title>
        <q-btn flat round dense color="info" icon="close" @click="closePanelNode(drawers.VIEW_PRESET)">
          <q-tooltip>Close</q-tooltip>
        </q-btn>
      </q-toolbar>
      <q-list dense>
        <q-item clickable @click="reset3DView">
          <q-item-section avatar><q-icon color="info" name="restart_alt" /></q-item-section>
          <q-item-section>Reset 3D View</q-item-section>
        </q-item>
        <q-item clickable @click="zoomSceneExtents">
          <q-item-section avatar><q-icon color="info" name="zoom_out_map" /></q-item-section>
          <q-item-section>Zoom Extents</q-item-section>
        </q-item>
        <q-separator />
        <q-item clickable @click="setViewPreset('top')">
          <q-item-section avatar><q-icon color="info" name="vertical_align_top" /></q-item-section>
          <q-item-section>Top</q-item-section>
        </q-item>
        <q-item clickable @click="setViewPreset('bottom')">
          <q-item-section avatar><q-icon color="info" name="vertical_align_bottom" /></q-item-section>
          <q-item-section>Bottom</q-item-section>
        </q-item>
        <q-item clickable @click="setViewPreset('left')">
          <q-item-section avatar><q-icon color="info" name="west" /></q-item-section>
          <q-item-section>Left</q-item-section>
        </q-item>
        <q-item clickable @click="setViewPreset('right')">
          <q-item-section avatar><q-icon color="info" name="east" /></q-item-section>
          <q-item-section>Right</q-item-section>
        </q-item>
        <q-item clickable @click="setViewPreset('front')">
          <q-item-section avatar><q-icon color="info" name="south" /></q-item-section>
          <q-item-section>Front</q-item-section>
        </q-item>
        <q-item clickable @click="setViewPreset('back')">
          <q-item-section avatar><q-icon color="info" name="north" /></q-item-section>
          <q-item-section>Back</q-item-section>
        </q-item>
        <q-separator />
        <q-item clickable @click="setViewPreset('axonometric')">
          <q-item-section avatar><q-icon color="info" name="view_in_ar" /></q-item-section>
          <q-item-section>Axonometric</q-item-section>
        </q-item>
      </q-list>
    </panel-node-surface>

    <panel-node-surface panel-id="CAMERA" :layouts="panelLayouts.CAMERA" :active="editorMode">
      <q-toolbar class="pandaui-panel__toolbar text-white shadow-2">
        <q-toolbar-title>Camera Settings</q-toolbar-title>
        <q-btn flat round dense color="info" icon="close" @click="closePanelNode(drawers.CAMERA)">
          <q-tooltip>Close</q-tooltip>
        </q-btn>
      </q-toolbar>
      <q-list dense bordered>
        <q-item>
          <q-item-section>Projection</q-item-section>
          <q-item-section side class="camera-control">
            <q-select v-model="cameraSettings.projection" dense outlined emit-value map-options :options="cameraProjectionOptions" />
          </q-item-section>
        </q-item>
        <q-item v-if="cameraSettings.projection === 'perspective'">
          <q-item-section>Field of view</q-item-section>

          <q-item-section side class="camera-control"><q-input v-model.number="cameraSettings.fov" dense outlined type="number" suffix="deg" :min="1" :max="179" /></q-item-section>
        </q-item>
        <q-item v-else>
          <q-item-section>View height</q-item-section>
          <q-item-section side class="camera-control"><q-input v-model.number="cameraSettings.orthographicHeight" dense outlined type="number" :min="0.0001" /></q-item-section>
        </q-item>
        <q-item>
          <q-item-section>Near / Far</q-item-section>
          <q-item-section side class="row no-wrap q-gutter-xs">
            <q-input v-model.number="cameraSettings.near" dense outlined type="number" class="camera-number" />
            <q-input v-model.number="cameraSettings.far" dense outlined type="number" class="camera-number" />
          </q-item-section>
        </q-item>
      </q-list>
      <q-list dense bordered>
        <q-item-label header>Position</q-item-label>
        <q-item :inset-level="insetLevel">
          <q-item-section side class="row no-wrap q-gutter-xs">
            <q-input v-model.number="cameraSettings.position.x" dense outlined type="number" label="X" class="camera-number" />
            <q-input v-model.number="cameraSettings.position.y" dense outlined type="number" label="Y" class="camera-number" />
            <q-input v-model.number="cameraSettings.position.z" dense outlined type="number" label="Z" class="camera-number" />
          </q-item-section>
        </q-item>
        <q-item-label header>Target</q-item-label>
        <q-item :inset-level="insetLevel">
          <q-item-section side class="row no-wrap q-gutter-xs">
            <q-input v-model.number="cameraSettings.target.x" dense outlined type="number" label="X" class="camera-number" />
            <q-input v-model.number="cameraSettings.target.y" dense outlined type="number" label="Y" class="camera-number" />
            <q-input v-model.number="cameraSettings.target.z" dense outlined type="number" label="Z" class="camera-number" />
          </q-item-section>
        </q-item>
        <q-item>
          <q-item-section><q-btn outline color="info" icon="north" label="Reset Top View" @click="resetTopView" /></q-item-section>
          <q-item-section side><q-btn color="secondary" icon="check" label="Apply" @click="applyCameraSettings" /></q-item-section>
        </q-item>
      </q-list>
    </panel-node-surface>

    <panel-node-surface panel-id="VIEW" :layouts="panelLayouts.VIEW" :active="editorMode">
      <display-settings-panel :viewmodel="viewmodel" :message="displaySettingsMessage" :meshing-busy="meshingBusy"
        @visibility="updateVisibility" @shading="updateShadingSettings" @render="updateRenderSettings"
        @environment="updateDisplayEnvironment" @points="updatePointSize" @viewport="updateViewportSettings"
        @save="saveDisplaySettings" @load="loadDisplaySettings" @reset="resetDisplaySettings" />
    </panel-node-surface>

    <panel-node-surface panel-id="MATERIAL" :layouts="panelLayouts.MATERIAL" :active="editorMode">
      <q-toolbar class="pandaui-panel__toolbar text-white shadow-2">
        <q-toolbar-title>Render Materials</q-toolbar-title>
        <q-btn flat round dense color="info" icon="add" @click="createRenderMaterial"><q-tooltip>New material</q-tooltip></q-btn>
        <q-btn flat round dense color="info" icon="close" @click="closePanelNode(drawers.MATERIAL)"/>
      </q-toolbar>

      <div class="q-pa-sm">
        <q-btn outline color="info" icon="ads_click" label="Select object" class="full-width" @click="selectMaterialObject" />
      </div>

      <div class="q-pa-sm">
        <div class="text-caption text-grey-8 q-mb-xs">Document material set</div>
        <q-list v-if="renderMaterials.length" dense bordered separator class="material-library-list">
          <q-item
            v-for="material in renderMaterials"
            :key="material.id"
            clickable
            :active="selectedRenderMaterial && selectedRenderMaterial.id === material.id"
            active-class="bg-blue-1 text-primary"
            @click="selectRenderMaterial(material)"
          >
            <q-item-section avatar>
              <div class="material-swatch" :style="{ backgroundColor: material.color }" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ material.name }}</q-item-label>
              <q-item-label caption>{{ materialTypeLabel(material.materialType) }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge outline :color="material.source === 'Rhino' ? 'info' : 'secondary'" :label="material.source" />
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="q-pa-md text-grey-7 text-center">No Rhino materials were imported. Create a material to begin.</div>

        <q-btn
          class="full-width q-mt-sm"
          outline
          color="info"
          icon="format_paint"
          label="Assign to selected object"
          :disable="!selectedSceneObject || !selectedRenderMaterial"
          @click="assignSelectedRenderMaterial"
        />
        <div class="text-caption text-grey-7 q-mt-xs">Shade mode continues to use the object's imported Display Color.</div>
      </div>

      <q-separator />
      <q-list dense>
        <q-item-label header>Shade Material</q-item-label>
        <q-item v-if="shadeMaterial">
          <q-item-section>Color</q-item-section>
          <q-item-section side><q-input v-model="shadeMaterial.color" dense outlined type="color" @update:model-value="updateShadeMaterial" /></q-item-section>
        </q-item>
        <q-item v-if="shadeMaterial">
          <q-item-section>Opacity</q-item-section>
          <q-item-section side class="material-control"><q-slider v-model="shadeMaterial.opacity" :min="0" :max="1" :step="0.01" label @update:model-value="updateShadeMaterial" /></q-item-section>
        </q-item>

        <q-item v-else><q-item-section caption>Select an object to edit Shade material.</q-item-section></q-item>
      </q-list>

      <q-separator />
      <q-list v-if="selectedRenderMaterial" dense>
        <q-item-label header>Material editor</q-item-label>
        <q-item><q-item-section>Material name</q-item-section><q-item-section side class="material-control"><q-input v-model="selectedRenderMaterial.name" dense outlined debounce="250" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        <q-item><q-item-section>Rhino material type<q-item-label caption>{{ selectedRenderMaterial.physicallyBased ? 'Physically based material' : 'Legacy / inferred material' }}</q-item-label></q-item-section><q-item-section side class="material-control"><q-select v-model="selectedRenderMaterial.materialType" dense outlined emit-value map-options :options="materialTypeOptions" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        <q-item><q-item-section>Base color</q-item-section><q-item-section side><q-input v-model="selectedRenderMaterial.color" dense outlined type="color" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>

        <template v-if="['general', 'textured', 'plastic', 'paint'].includes(selectedRenderMaterial.materialType)">
          <q-item><q-item-section>Base color texture<q-item-label caption lines="1">{{ selectedRenderMaterial.textureName || 'No texture loaded' }}</q-item-label></q-item-section><q-item-section side class="material-texture-control"><div class="row items-center no-wrap q-gutter-xs"><q-file v-model="materialTextureFile" dense outlined clearable accept="image/*" label="Select image" @update:model-value="loadRenderMaterialTexture" /><q-btn flat round dense color="info" icon="delete_outline" :disable="!selectedRenderMaterial.textureName" @click="clearRenderMaterialTexture"><q-tooltip>Remove texture</q-tooltip></q-btn></div></q-item-section></q-item>
          <template v-if="selectedRenderMaterial.supportsUv">
            <q-item-label header>UV Mapping</q-item-label>

            <q-item><q-item-section>Scale U</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.uvScaleU" :min="0.01" :max="10" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
            <q-item><q-item-section>Scale V</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.uvScaleV" :min="0.01" :max="10" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
            <q-item><q-item-section>Offset U</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.uvOffsetU" :min="-5" :max="5" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
            <q-item><q-item-section>Offset V</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.uvOffsetV" :min="-5" :max="5" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
            <q-item><q-item-section>Rotation (°)</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.uvRotation" :min="0" :max="360" :step="1" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
            <q-item><q-item-section>Wrap mode</q-item-section><q-item-section side><q-select v-model="selectedRenderMaterial.uvWrapMode" dense outlined emit-value map-options :options="uvWrapOptions" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          </template>
        </template>

        <template v-if="selectedRenderMaterial.materialType === 'glass'">
          <q-item-label header>Glass</q-item-label>
          <q-item><q-item-section>Transmission</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.transmission" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Refraction roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.refractionRoughness" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Glass thickness</q-item-section><q-item-section side class="material-control"><q-input v-model.number="selectedRenderMaterial.thickness" dense outlined type="number" min="0" step="0.01" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Fog color</q-item-section><q-item-section side><q-input v-model="selectedRenderMaterial.refractionColor" dense outlined type="color" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Fog distance</q-item-section><q-item-section side class="material-control"><q-input v-model.number="selectedRenderMaterial.attenuationDistance" dense outlined type="number" min="0.0001" step="0.1" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Surface roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.roughness" :min="0.04" :max="0.6" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Index of refraction<q-item-label caption>Controls screen-space Fresnel and refraction; Reflectivity controls the native environment response.</q-item-label></q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.ior" :min="1" :max="2.5" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Reflectivity</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.reflectivity" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Surface opacity</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.opacity" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        </template>

        <template v-else-if="selectedRenderMaterial.materialType === 'metal'">
          <q-item-label header>Metal</q-item-label>
          <q-item><q-item-section>Metalness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.metalness" :min="0.65" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.roughness" :min="0.04" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Reflectivity</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.reflectivity" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Anisotropy<q-item-label caption>Preserved for a future renderer upgrade.</q-item-label></q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.anisotropy" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Anisotropy rotation</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.anisotropyRotation" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        </template>

        <template v-else-if="selectedRenderMaterial.materialType === 'plastic'">
          <q-item-label header>Plastic</q-item-label>
          <q-item><q-item-section>Roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.roughness" :min="0.04" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Reflectivity</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.reflectivity" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Clearcoat</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.clearcoat" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        </template>

        <template v-else-if="selectedRenderMaterial.materialType === 'emissive'">
          <q-item-label header>Emission</q-item-label>
          <q-item><q-item-section>Emission color</q-item-section><q-item-section side><q-input v-model="selectedRenderMaterial.emissive" dense outlined type="color" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Emission intensity</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.emissiveIntensity" :min="0" :max="20" :step="0.1" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Surface roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.roughness" :min="0.04" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        </template>

        <template v-else-if="selectedRenderMaterial.materialType === 'paint'">
          <q-item-label header>Paint / Coating</q-item-label>
          <q-item><q-item-section>Base roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.roughness" :min="0.04" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Clearcoat</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.clearcoat" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Clearcoat roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.clearcoatRoughness" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>

          <q-item><q-item-section>Metallic flakes</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.metalness" :min="0" :max="0.45" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        </template>

        <template v-else-if="selectedRenderMaterial.materialType === 'textured'">
          <q-item-label header>Textured Material</q-item-label>
          <q-item><q-item-section>Metalness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.metalness" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.roughness" :min="0.04" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        </template>

        <template v-else>
          <q-item-label header>General Physical Material</q-item-label>
          <q-item><q-item-section>Metalness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.metalness" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Roughness</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.roughness" :min="0.04" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Reflectivity</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.reflectivity" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
          <q-item><q-item-section>Opacity</q-item-section><q-item-section side class="material-control"><q-slider v-model="selectedRenderMaterial.opacity" :min="0" :max="1" :step="0.01" label @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        </template>
        <q-item><q-item-section><q-toggle v-model="selectedRenderMaterial.wireframe" label="Wireframe" @update:model-value="updateRenderMaterial" /></q-item-section></q-item>
        <q-item><q-item-section><q-btn outline color="info" icon="restart_alt" label="Reset material" @click="resetRenderMaterial" /></q-item-section></q-item>
      </q-list>
    </panel-node-surface>

    <panel-node-surface panel-id="EDITOR" :layouts="panelLayouts.EDITOR" :active="editorMode">
      <q-toolbar class="pandaui-panel__toolbar text-white shadow-2">
        <q-toolbar-title>Editor Settings</q-toolbar-title>
        <q-btn flat round dense color="info" icon="close" @click="closePanelNode(drawers.EDITOR)">
          <q-tooltip>Close</q-tooltip>
        </q-btn>
      </q-toolbar>
      <editor-settings-panel :appearance="nodeAppearance" :storage-error="appearanceStorageError" :execution-state="editorExecutionState"
        @appearance="updateNodeAppearance" @reset-appearance="resetNodeAppearance" @command="runEditorCommand">
        <template #documents><node-document-manager :workspace="nodeDocuments" :state="nodeDocumentState" /></template>
      </editor-settings-panel>
    </panel-node-surface>

    <panel-node-surface panel-id="PLUGINS" :layouts="panelLayouts.PLUGINS" :active="editorMode">
      <q-toolbar class="pandaui-panel__toolbar text-white shadow-2">
        <q-toolbar-title>Node Plugins</q-toolbar-title>
        <q-btn flat round dense color="info" icon="close" @click="closePanelNode(drawers.PLUGINS)"><q-tooltip>Close</q-tooltip></q-btn>
      </q-toolbar>
      <div class="q-pa-sm">
        <q-file v-model="nodePluginFile" dense outlined clearable accept=".js,text/javascript,application/javascript" label="Install local plugin" @update:model-value="installNodePlugin" />
        <div v-if="pluginInstallMessage" class="q-pt-xs text-caption text-info">{{ pluginInstallMessage }}</div>
      </div>
      <q-list v-if="nodePlugins.length" dense separator>
        <template v-for="plugin in nodePlugins" :key="plugin.id">
          <q-item clickable @click="togglePluginDetails(plugin.id)">
            <q-item-section avatar>
              <q-avatar square color="primary" text-color="white" size="32px"><q-icon :name="plugin.icon" /></q-avatar>
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ plugin.name }}</q-item-label>
              <q-item-label caption>{{ plugin.description }}</q-item-label>
              <q-item-label caption class="text-info">{{ plugin.version }} · {{ nodeCountForPlugin(plugin) }} nodes</q-item-label>
            </q-item-section>
            <q-item-section side top class="items-end q-gutter-xs">
              <q-toggle :model-value="isPluginEnabled(plugin)" :disable="!isPluginInstalled(plugin)" color="secondary" @click.stop @update:model-value="setPluginEnabled(plugin, $event)"><q-tooltip>{{ isPluginEnabled(plugin) ? 'Disable plugin' : 'Enable plugin' }}</q-tooltip></q-toggle>
              <q-btn v-if="isPluginInstalled(plugin)" flat round dense color="info" icon="delete_outline" @click.stop="setPluginInstalled(plugin, false)"><q-tooltip>Uninstall plugin</q-tooltip></q-btn>
              <q-btn v-else flat round dense color="secondary" icon="download" @click.stop="setPluginInstalled(plugin, true)"><q-tooltip>Install plugin</q-tooltip></q-btn>
            </q-item-section>
          </q-item>
          <!-- Three-level hierarchy for GH Catalog: library -> category -> node -->
          <template v-if="plugin.groups && plugin.groups.length">
            <q-list v-if="expandedPluginIds.includes(plugin.id)" dense class="q-ml-lg q-mr-sm q-mb-sm">
              <template v-for="group in plugin.groups" :key="group.name">
                <q-item
                  clickable
                  dense
                  class="q-ml-sm"
                  @click="togglePluginDetails(plugin.id + ':' + group.name)"
                >
                  <q-item-section>
                    <q-item-label class="text-weight-medium">{{ group.name }}</q-item-label>
                    <q-item-label caption>{{ group.categories.length }} categories · {{ group.categories.reduce((sum, c) => sum + c.nodes.length, 0) }} nodes</q-item-label>
                  </q-item-section>

                  <q-item-section side top>
                    <q-icon
                      :name="expandedPluginIds.includes(plugin.id + ':' + group.name) ? 'expand_less' : 'expand_more'"
                      size="18px"
                      class="text-grey-7"
                    />
                  </q-item-section>
                </q-item>
                <template v-if="expandedPluginIds.includes(plugin.id + ':' + group.name)">
                  <q-list
                    v-for="cat in group.categories"
                    :key="group.name + ':' + cat.name"
                    dense
                    class="q-ml-md q-mr-xs q-mb-xs"
                    style="background: rgba(0,0,0,0.25); border-radius: 4px;"
                  >
                    <q-item dense class="q-mb-xs">
                      <q-item-section>
                        <q-item-label class="text-caption text-weight-bold text-primary">{{ cat.name }}</q-item-label>
                      </q-item-section>
                    </q-item>
                    <q-item
                      v-for="node in cat.nodes"
                      :key="node.type"
                      dense
                      class="q-ml-sm"
                    >
                      <q-item-section>
                        <q-item-label class="text-weight-medium">{{ node.name }}</q-item-label>
                        <q-item-label caption>{{ node.description }}</q-item-label>
                        <q-item-label caption class="text-info">{{ node.type }}</q-item-label>
                      </q-item-section>
                    </q-item>
                  </q-list>
                </template>
              </template>
            </q-list>
          </template>
          <!-- Two-level rendering for other plugins (plugin -> node) -->
          <template v-else>
            <q-list v-if="expandedPluginIds.includes(plugin.id)" dense class="q-ml-lg q-mr-sm q-mb-sm">
              <q-item v-for="node in plugin.nodes" :key="node.type" dense>
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{ node.name }}</q-item-label>
                  <q-item-label caption>{{ node.description }}</q-item-label>
                  <q-item-label caption class="text-info">{{ node.type }}</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </template>
        </template>
      </q-list>
      <div v-else class="q-pa-lg text-grey-7 text-center">Loading node plugins</div>
    </panel-node-surface>

    <aside
      class="node-editor-panel"
      :class="{
        'node-editor-panel--active': true,
        'node-editor-panel--editor-mode': editorMode,
        'node-editor-panel--passthrough': !editorMode
      }"
      aria-label="Node editor"
    >
      <iframe id="editorFrame" class="node-editor-panel__frame" src="/editor/index.html" title="Node editor" @load="onEditorFrameLoaded"></iframe>
    </aside>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script>
import PandaUIApp from '../PandaUIApp'
import DisplayMode from '../DisplayMode'
import LayerTreeItem from '../components/LayerTreeItem.vue'
import PanelNodeSurface from '../components/PanelNodeSurface.vue'
import GeometryDocumentTree from '../components/GeometryDocumentTree.vue'
import NodeDocumentManager from '../components/NodeDocumentManager.vue'
import DisplaySettingsPanel from '../components/DisplaySettingsPanel.vue'
import EditorSettingsPanel from '../components/EditorSettingsPanel.vue'
import useNodeAppearance from '../composables/useNodeAppearance'
import NodeDocumentWorkspace from '../NodeDocumentWorkspace'
import NodeDocumentFiles from '../NodeDocumentFiles'
import ViewportGestureRouter from '../ViewportGestureRouter'
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import ViewportOverlay from '../components/ViewportOverlay.vue'
import SceneDocumentsPanel from '../components/SceneDocumentsPanel.vue'
import SceneWorkspace from '../collaboration/SceneWorkspace'
import useRecentFiles from '../composables/useRecentFiles'
import useMeshProgress from '../composables/useMeshProgress'
import useDisplaySettings from '../composables/useDisplaySettings'
import useCameraSettings from '../composables/useCameraSettings'
import useEditorBridge from '../composables/useEditorBridge'
import useNodePlugins from '../composables/useNodePlugins'
import useRenderMaterials from '../composables/useRenderMaterials'
import useModelImport from '../composables/useModelImport'

export default {
  components: { LayerTreeItem, PanelNodeSurface, GeometryDocumentTree, NodeDocumentManager, DisplaySettingsPanel, EditorSettingsPanel, ViewportOverlay, SceneDocumentsPanel },

  setup () {
    const { nodeAppearance, appearanceStorageError, updateNodeAppearance, resetNodeAppearance, applyNodeAppearance } = useNodeAppearance()
    const layerDrawerVisible = ref(false)
    const panelLayouts = shallowRef({})
    const nodeDocumentState = shallowRef({ documents: [], recent: [], busy: false, message: '', error: false, activeId: null })
    const sceneState = shallowRef({ documents: [] })
    const sceneWorkspace = new SceneWorkspace(PandaUIApp, state => { sceneState.value = state })
    const nodeDocuments = new NodeDocumentWorkspace({
      getBridge: () => document.getElementById('editorFrame')?.contentWindow?.PandaUINodeDocuments,
      files: NodeDocumentFiles,
      onClosed: id => PandaUIApp.getOperations().releaseGraphResources(id),
      onChange: state => { nodeDocumentState.value = state }
    })
    const markNodeDocumentChanged = event => nodeDocuments.markChanged(event.detail?.editToken)
    const fileDrawerVisible = ref(false)

    const historyDrawerVisible = ref(false)
    const historyEntries = ref([])
    const historyIndex = ref(-1)
    const historyLimit = ref(20)
    const historyBusy = ref(false)
    let unsubscribeHistory = null

    const viewPresetDrawerVisible = ref(false)
    const viewDrawerVisible = ref(false)
    const cameraDrawerVisible = ref(false)
    const materialDrawerVisible = ref(false)
    const editorDrawerVisible = ref(false)
    const pluginDrawerVisible = ref(false)




    const viewmodel = ref(PandaUIApp._viewmodel)
    const drawers = { FILE: 1, LAYER: 2, VIEW: 3, MATERIAL: 4, EDITOR: 5, PLUGINS: 6, VIEW_PRESET: 7, CAMERA: 8, HISTORY: 9, DOCUMENT: 10 }
    const backgroundModes = DisplayMode.backgroundModes
    const insetLevel = 0.3


    

    


    // 浠嶪ndex.vue绉诲姩鐨勭姸鎬佸彉閲?
    
    
    let viewportGestures = null


    function modelExists () {
      return viewmodel.value.model1.exists
    }

    function modelLabel () {
      if (viewmodel.value.model1.exists) return 'Model: ' + viewmodel.value.model1.name
      return 'Model: (none)'
    }


    function title () {
      let t = PandaUIApp.applicationTitle()
      console.log('title:', t)
      if (viewmodel.value.model1.name.length > 0) {
        t = viewmodel.value.model1.name
      }
      return t
    }

    function toggleDrawer (drawer) {
      const key = Object.keys(drawers).find(key => drawers[key] === drawer)
      if (!key) return
      editorMode.value = true
      if (key === 'MATERIAL') refreshRenderMaterials()
      if (key === 'CAMERA') refreshCameraSettings()
      document.getElementById('editorFrame')?.contentWindow?.PandaUIOpenPanelNode?.(key)
    }

    function closePanelNode (drawer) {
      const key = Object.keys(drawers).find(key => drawers[key] === drawer)
      document.getElementById('editorFrame')?.contentWindow?.PandaUIClosePanelNodes?.(key)
    }

    function updatePanelNodes (layouts) {
      const next = {}
      for (const layout of layouts) {
        if (!drawers[layout.panelId]) continue
        if (!next[layout.panelId]) next[layout.panelId] = []
        next[layout.panelId].push(layout)
      }
      const materialsAdded = !panelLayouts.value.MATERIAL?.length && next.MATERIAL?.length
      panelLayouts.value = next
      if (materialsAdded) refreshRenderMaterials()
      const states = { FILE: fileDrawerVisible, LAYER: layerDrawerVisible, VIEW_PRESET: viewPresetDrawerVisible, VIEW: viewDrawerVisible, CAMERA: cameraDrawerVisible, MATERIAL: materialDrawerVisible, EDITOR: editorDrawerVisible, PLUGINS: pluginDrawerVisible, HISTORY: historyDrawerVisible }
      Object.keys(states).forEach(key => { states[key].value = Boolean(next[key]?.length) })
    }

    

    

    

    

    function syncHistory (state) {
      historyEntries.value = state?.entries || []
      historyIndex.value = Number.isInteger(state?.index) ? state.index : -1
      historyLimit.value = Number(state?.limit) || 20
      historyBusy.value = state?.busy === true
    }

    function setHistoryLimit () {
      PandaUIApp.getDisplayPipeline()?.setModelingHistoryLimit(historyLimit.value)
    }

    function historyUndo () {
      PandaUIApp.getDisplayPipeline()?.executeModelingHistory('modeling.undo')
    }

    function historyRedo () {
      PandaUIApp.getDisplayPipeline()?.executeModelingHistory('modeling.redo')
    }

    function restoreHistory (index) {
      PandaUIApp.getDisplayPipeline()?.restoreModelingHistory(index)
    }

    function closeAllPopupPanels () {
      fileDrawerVisible.value = false
      layerDrawerVisible.value = false
      viewPresetDrawerVisible.value = false
      viewDrawerVisible.value = false
      cameraDrawerVisible.value = false
      materialDrawerVisible.value = false
      editorDrawerVisible.value = false
      pluginDrawerVisible.value = false
      historyDrawerVisible.value = false
    }

    const popupPanelSelector = '.pandaui-panel, .q-drawer, .q-menu, .q-dialog, .q-footer'
    let popupPanelPointerStartedInside = false
    let ignoreOutsideClickUntil = 0

    function isPopupPanelEvent (event) {
      const target = event.target
      const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
      return eventPath.some(node => node instanceof Element && node.matches(popupPanelSelector)) ||
        (target instanceof Element && target.closest(popupPanelSelector) != null)
    }

    function trackPopupPanelPointerDown (event) {
      popupPanelPointerStartedInside = isPopupPanelEvent(event)
    }

    function trackPopupPanelPointerUp () {
      if (popupPanelPointerStartedInside) ignoreOutsideClickUntil = performance.now() + 250
      window.setTimeout(() => {
        popupPanelPointerStartedInside = false
      }, 0)
    }

    function closeDrawersOnOutsideClick (event) {
      if (popupPanelPointerStartedInside || performance.now() < ignoreOutsideClickUntil) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (isPopupPanelEvent(event)) return

      const pointerX = Number(event.clientX)
      const pointerY = Number(event.clientY)
      if (Number.isFinite(pointerX) && Number.isFinite(pointerY)) {
        const insideVisiblePanel = Array.from(document.querySelectorAll('.pandaui-panel, .q-drawer, .q-menu, .q-dialog')).some(panel => {
          const bounds = panel.getBoundingClientRect()
          if (bounds.width <= 0 || bounds.height <= 0) return false
          const style = window.getComputedStyle(panel)
          if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false
          return pointerX >= bounds.left && pointerX <= bounds.right && pointerY >= bounds.top && pointerY <= bounds.bottom
        })
        if (insideVisiblePanel) return
      }
      closeAllPopupPanels()
    }

    

    

    

    

    

    

    

    



    

    const editorStartupError = ref('')
    async function onEditorFrameLoaded () {
      editorStartupError.value = ''
      editorFrameLoaded.value = false
      try {
        const frame = document.getElementById('editorFrame')?.contentWindow
        if (!frame?.PandaUIEditorReady) throw new Error('Editor scripts could not be loaded. Refresh the page to retry.')
        await frame.PandaUIEditorReady
        if (!frame.graph) throw new Error('Editor graph initialization failed.')
        editorFrameLoaded.value = true
        applyNodeAppearance()
        PandaUIApp.getOperations().bind(frame.graph)
        viewportGestures?.attachEditor()
        postToEditor({ type: 'pandaui-editor-mode', active: editorMode.value })
        flushPendingCatalog()
        await nodeDocuments.initialize()
        await sceneWorkspace.initialize()
        await loadNodeCatalog()
        requestNodePlugins()
      } catch (error) {
        editorStartupError.value = error.message || 'Editor initialization failed.'
        if (!catalogLoaded.value) catalogError.value = 'Startup failed: ' + editorStartupError.value
        console.error('Unable to initialize the editor:', error)
      }
    }
    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    function requestNodeDocumentCommand (command) {
      const editorWindow = document.getElementById('editorFrame')?.contentWindow
      editorWindow?.PandaUIOpenPanelNode?.('EDITOR')
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('pandaui-node-document-command', { detail: command })), 0)
    }

    function saveEditorGraphToFile () { requestNodeDocumentCommand('save') }

    function loadEditorGraphFromFile () { requestNodeDocumentCommand('open') }

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    

    



    

    

    

    

    

    

    

    

    

    

    

    

    

    

    // 浠嶪ndex.vue绉诲姩鐨勪簨浠跺鐞嗗嚱鏁?
    

    

    

    

    

    

    

    

    


    const { recentFiles, rememberRecentEntry, rememberRecentFile, recentFileName } = useRecentFiles()

    const { meshProgressText, meshProgressDone, meshProgressError } = useMeshProgress()

    const { displaySettingsMessage, meshingBusy, updateVisibility, setLayerVisibility, updateRenderSettings, updateShadingSettings, saveDisplaySettings, loadDisplaySettings, resetDisplaySettings, updatePointSize, updateViewportSettings, updateDisplayEnvironment, selectRenderEnvironment, selectShadingEnvironment, clearRenderEnvironment, clearShadingEnvironment } = useDisplaySettings({ viewmodel })

    const { panMode, cameraSettings, cameraProjectionOptions, refreshCameraSettings, applyCameraSettings, resetTopView, perspectiveCamera, setProjection, setViewPreset, reset3DView, zoomSceneExtents } = useCameraSettings({ viewmodel, closeViewPresets: () => { viewPresetDrawerVisible.value = false } })

    const { editorMode, editorSaveMessage, editorExecutionState, editorFrameLoaded, runEditorCommand, postToEditor } = useEditorBridge({ closeAllPopupPanels, saveEditorGraphToFile, loadEditorGraphFromFile, requestNodeDocumentCommand, onPluginCatalog: message => onPluginCatalog(message), onPluginInstalled: message => onPluginInstalled(message) })

    const { nodePlugins, expandedPluginIds, nodePluginStates, nodePluginSources, folderNodePluginSources, nodePluginFile, pluginInstallMessage, pendingNodePlugin, catalogLoaded, catalogCount, catalogError, isPluginInstalled, isPluginEnabled, setPluginInstalled, setPluginEnabled, togglePluginDetails, nodeCountForPlugin, requestNodePlugins, loadNodeCatalog, installNodePlugin, flushPendingCatalog, onPluginCatalog, onPluginInstalled } = useNodePlugins({ runEditorCommand, editorFrameLoaded })

    const { renderMaterials, selectedRenderMaterial, selectedSceneObject, materialTextureFile, shadeMaterial, materialTypeOptions, materialTypeLabel, uvWrapOptions, refreshRenderMaterials, selectRenderMaterial, selectMaterialObject, createRenderMaterial, updateRenderMaterial, resetRenderMaterial, assignSelectedRenderMaterial, updateShadeMaterial, loadRenderMaterialTexture, clearRenderMaterialTexture } = useRenderMaterials({ editorMode })

    const { fileProcessing, modelImportBusy, cancelFileImport, modelFileDragActive, modelFileDropMessage, openFileMenuVisible, importFileMenuVisible, recentFileDialogVisible, pendingRecentFilePath, openFileTypes, importFileTypes, loadingModel, loadingDetail, closeModel, selectRecentFile, runRecentFileAction, openFile, createEmptyDocument } = useModelImport({ fileDrawerVisible, recentFiles, rememberRecentEntry, rememberRecentFile, refreshRenderMaterials })

    watch([loadingModel, meshProgressDone, meshProgressError], ([loading, meshDone, meshError]) => {
      PandaUIApp.viewModel().displayGeometryLoading = loading || (!meshDone && !meshError)
    }, { immediate: true, flush: 'sync' })

    onMounted(() => {
      viewportGestures = new ViewportGestureRouter({
        frame: document.getElementById('editorFrame'),
        scene: document.querySelector('#canvasParent > canvas'),
        getEditorMode: () => editorMode.value,
        setEditorMode: active => { editorMode.value = active },
        canLeaveScene: event => PandaUIApp.getDisplayPipeline()?.canStartNodeGraphGesture(event)
      })
      window.PandaUIUpdatePanelNodes = updatePanelNodes
      window.PandaUICaptureScenePreview = references => meshProgressDone.value
        ? PandaUIApp.getDisplayPipeline()?.captureScenePreview(references) : null
      window.addEventListener('pandaui-node-document-change', markNodeDocumentChanged)
      window.addEventListener('pointerdown', trackPopupPanelPointerDown, true)
      window.addEventListener('pointerup', trackPopupPanelPointerUp, true)
      window.addEventListener('click', closeDrawersOnOutsideClick)
      unsubscribeHistory = PandaUIApp.getDisplayPipeline()?.subscribeModelingHistory(syncHistory)

    })
    onUnmounted(() => {
      sceneWorkspace.dispose()
      PandaUIApp.viewModel().displayGeometryLoading = false
      viewportGestures?.dispose()
      delete window.PandaUIUpdatePanelNodes
      delete window.PandaUICaptureScenePreview
      window.removeEventListener('pandaui-node-document-change', markNodeDocumentChanged)
      window.removeEventListener('pointerdown', trackPopupPanelPointerDown, true)
      window.removeEventListener('pointerup', trackPopupPanelPointerUp, true)
      window.removeEventListener('click', closeDrawersOnOutsideClick)
      if (unsubscribeHistory != null) unsubscribeHistory()
    })

    return {
      viewportUi: PandaUIApp.getViewportUi().state,
      handleViewportAction: action => PandaUIApp.getViewportUi().dispatch(action),
      modelFileDragActive,
      modelFileDropMessage,
      panelLayouts,
      closePanelNode,
      layerDrawerVisible,
      fileDrawerVisible,
      historyDrawerVisible,
      historyEntries,
      historyIndex,
      historyLimit,
      historyBusy,
      openFileMenuVisible,
      importFileMenuVisible,
      recentFileDialogVisible,
      pendingRecentFilePath,

      viewPresetDrawerVisible,
      viewDrawerVisible,
      cameraDrawerVisible,
      materialDrawerVisible,
      editorDrawerVisible,
      pluginDrawerVisible,
      renderMaterials,
      selectedRenderMaterial,
      selectedSceneObject,
      materialTextureFile,
      nodePlugins,
      expandedPluginIds,
      nodePluginStates,
      nodePluginSources,
      folderNodePluginSources,
      pendingNodePlugin,
      nodePluginFile,
      pluginInstallMessage,
      displaySettingsMessage,
      meshingBusy,
      updateViewportSettings,
      updateDisplayEnvironment,
      viewmodel,
      drawers,
      cameraSettings,
      cameraProjectionOptions,
      backgroundModes,
      insetLevel,
      modelExists,
      modelLabel,
      openFileTypes,
      importFileTypes,
      recentFiles,
      recentFileName,
      selectRecentFile,
      runRecentFileAction,
      editorSaveMessage,
      nodeDocuments,
      nodeDocumentState,
      sceneWorkspace,
      sceneState,
      editorExecutionState,
      nodeAppearance,
      appearanceStorageError,
      updateNodeAppearance,
      resetNodeAppearance,
      title,
      toggleDrawer,
      setHistoryLimit,
      historyUndo,
      historyRedo,
      restoreHistory,
      applyCameraSettings,
      resetTopView,
      isPluginInstalled,
      isPluginEnabled,
      setPluginInstalled,
      setPluginEnabled,
      togglePluginDetails,
      nodeCountForPlugin,
      requestNodePlugins,
      onEditorFrameLoaded,
      installNodePlugin,
      materialTypeOptions,
      materialTypeLabel,
      uvWrapOptions,
      refreshRenderMaterials,
      selectRenderMaterial,
      selectMaterialObject,
      createRenderMaterial,
      updateRenderMaterial,
      resetRenderMaterial,
      assignSelectedRenderMaterial,
      shadeMaterial,
      updateShadeMaterial,
      loadRenderMaterialTexture,
      clearRenderMaterialTexture,
      runEditorCommand,
      saveEditorGraphToFile,
      loadEditorGraphFromFile,
      closeModel,
      openFile,
      createEmptyDocument,
      updateVisibility,
      setLayerVisibility,
      updateRenderSettings,
      updatePointSize,
      selectRenderEnvironment,
      clearRenderEnvironment,
      updateShadingSettings,
      saveDisplaySettings,
      loadDisplaySettings,
      resetDisplaySettings,
      selectShadingEnvironment,
      clearShadingEnvironment,
      // 浠嶪ndex.vue绉诲姩鐨勭姸鎬佸拰鍑芥暟
      panMode,
      perspectiveCamera,
      setProjection,
      setViewPreset,
      reset3DView,
      zoomSceneExtents,
      editorMode,
      loadingModel,
      fileProcessing,
      modelImportBusy,
      loadingDetail,
      cancelFileImport,
      meshProgressText,
      meshProgressDone,
      meshProgressError,
      catalogCount,
      catalogError,
      editorFrameLoaded,
      editorStartupError,
      catalogLoaded
    }
  }
}

</script>

<style scoped>
.document-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.document-workspace :deep(.scene-documents) { flex: none; }
.document-workspace :deep(.document-manager) { flex: 1; height: auto; min-height: 150px; }
.model-file-drop {
  position: fixed;
  inset: 10px;
  z-index: 6000;
  display: grid;
  place-items: center;
  border: 2px dashed #36b7d8;
  border-radius: 12px;
  background: rgba(33, 97, 125, 0.12);
  pointer-events: none;
}

.model-file-drop__label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 28px;
  border: 1px solid rgba(54, 183, 216, 0.5);
  border-radius: 10px;
  background: rgba(236, 247, 251, 0.92);
  color: #1b536c;
  text-align: center;
}

.model-file-drop__label strong { font-size: 18px; }
.model-file-drop__label span { font-size: 12px; }
.node-editor-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  background: transparent;
  pointer-events: none;
}

.node-editor-panel--active {
  pointer-events: auto;
}

.node-editor-panel--editor-mode {
  bottom: 0;
}

.node-editor-panel--passthrough {
  pointer-events: none;
}

.node-editor-panel:not(.node-editor-panel--active) {
  visibility: hidden;
}

:deep(.pandaui-panel .q-drawer__content),
:deep(.pandaui-panel) {
  background: rgba(238, 242, 247, 0.25) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

:deep(.pandaui-panel__toolbar) {
  background: rgba(31, 83, 117, 0.25) !important;
}

:deep(.pandaui-panel__toolbar--transparent) {
  background: transparent !important;
  box-shadow: none !important;
}

.material-library-drawer {
  min-width: 360px;
}

.recent-file-path {
  overflow-wrap: anywhere;
  white-space: normal;
}

.material-library-list {
  max-height: 240px;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.25);
}

.material-swatch {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(30, 45, 55, 0.34);
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.38);
}

.material-control {
  min-width: 170px;
}

.camera-control {
  min-width: 170px;
}

.camera-number {
  width: 78px;
}

.material-texture-control {
  min-width: 170px;
}

.view-preset-menu {
  min-width: 150px;
}

.pandaui-bottom-toolbar {
  background: transparent !important;
  box-shadow: none !important;
}

.pandaui-toolbar-panel-trigger {
  order: 1;
}

.pandaui-toolbar-spacer {
  order: 2;
}

.pandaui-toolbar-action {
  order: 3;
}

.pandaui-toolbar-document {
  order: 4;
}

.node-editor-panel__frame {
  width: 100%;
  min-height: 0;
  flex: 1;
  border: 0;
  background: transparent;
}

.pandaui-infobar {
  pointer-events: none;
  line-height: 24px;
}

.pandaui-infobar__inner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 24px;
  font-size: 11px;
  color: rgba(255,255,255,0.75);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.pandaui-infobar__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pandaui-infobar__loading {
  padding: 2px 12px 5px;
  max-height: 52px;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 11px;
  line-height: 1.5;
  color: #ffd18a;
  background: transparent;
  pointer-events: none;
}

.pandaui-infobar__item.is-ok {
  color: rgba(120, 220, 160, 0.95);
}

.pandaui-infobar__item.is-waiting {
  color: rgba(255, 200, 100, 0.9);
}

.pandaui-infobar__item.is-err {
  color: rgba(255, 120, 120, 0.95);
}

.pandaui-infobar__sep {
  color: rgba(255,255,255,0.25);
  margin: 0 4px;
}

@media (max-width: 600px) {
  .node-editor-panel {
    bottom: 0;
  }
}
</style>


