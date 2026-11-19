# PandaUI Frontend 功能介绍与使用说明

本文针对本仓库的 **PandaUI Frontend**，界面按钮保留英文。本仓库包含节点编辑器和前端几何运行库，不包含后端，也不包含独立 PandaUI Preview 的左侧 Materials 面板、案例列表和保存目录绑定功能。

## 1. 安装与启动

推荐 Node.js 22、Yarn Classic 1.22.x，以及启用硬件加速的桌面 Chrome/Edge。

```sh
git clone https://github.com/yangdaoqian/PandaUI-Frontend.git
cd PandaUI-Frontend
yarn install --frozen-lockfile --ignore-scripts
yarn dev --port 9002
```

打开 <http://localhost:9002/>。不传 `--port` 时当前配置使用 9000。无需安装 Rhino 或启动后端即可使用本地导入、节点编辑和渲染的已实现功能。开发配置的 `/api` 默认代理到本机 9001；没有后端时进入 Local mode。`.env.example` 不会自动生效，其中旧的端口/后端地址变量当前未接入配置。

首次构建需要安装依赖；本地运行不表示新机器无需联网准备依赖。运行时使用本地提供的 Worker/WASM，不通过云端转换本地模型。

## 2. 工作区与文档

工作区包括 3D 场景、节点编辑区域和文件/文档/显示等控制节点。右键添加节点可按英文名搜索；功能分类包括 Panels、Parameters、Data、Math、Geometry、Transform、Display、Render 等，空分类可能不显示。

- **Files**：选择处理方式与源模型。
- **Document Manager**：选择本地文档、打开/导入、创建、保存和管理文档。
- **Display**：显示模式、边线、网格精度等。
- **Render** 分类：环境、灯光、材质、相机、质量和效果描述节点，连接到 Render Output。

前端导入模型出现在 Private documents，无需选择公共文档。账户、公共文档、共享显示、服务器保存和几何发布需要另行部署兼容后端；本仓库没有服务实现。本地保存不等于服务器发布。

## 3. 打开模型

1. 在 Files 的 **File processing** 选择 **Frontend · NodeC WASM**。
2. 使用 **Open file** 或拖入场景。需要附属资源的格式应一起选择，例如 `.gltf + .bin + 图片`、`.obj + .mtl + 图片`。
3. 等待扫描/解码。支持渐进导入的路径先显示边线或部分对象，再补齐网格；不是所有格式都能边读第一个字节边显示。
4. 在树中检查图层、实例和隐藏状态；不要仅凭画面判断源文件没有某对象。
5. 查看导入警告。部分显示成功不代表整个源文件已无损转换。

| 格式 | 处理与限制 |
| --- | --- |
| 3DM | NodeC 读取几何、属性和可用缓存网格，无缓存对象生成显示网格；插件自定义数据并非全部支持。 |
| STEP/STP | 索引实体，将支持的曲线/曲面和拓扑转换为 OpenNURBS，再进入公共显示链路；不是将三角网格冒充 Brep。前期索引和单个复杂体仍可能较慢。 |
| IGES/BREP | OCCT WASM 显示导入，不能假定保留了与 STEP 相同的可编辑 Brep。 |
| DWG/DXF | 前端解析支持的 CAD 实体，文字、标注、代理实体和特殊版本仍有兼容性限制。 |
| SKP | Worker 解码，保留支持的实例、边线、网格和材质，不是 NURBS；容器解析后进入渐进构建。 |
| OBJ/STL/PLY/DRC | 网格导入，无法凭显示网格恢复原始 CAD 参数与拓扑。 |
| GLB/glTF/FBX/3DS/DAE/3MF/AMF/VRML | 场景/网格路径，贴图和材质取决于格式及附属资源。 |
| VTK/VTP/PCD/XYZ/OFF | 相应几何或点云格式的受支持变体。 |

完整扩展名见 [README](../README.md#import-formats-and-boundaries)。这是已接入路径列表，不是所有版本/实体的兼容保证。

## 4. 选择与编辑

从视口或树选择对象，使用 Gumball 操作可编辑对象。实例保留父子结构；进入内部编辑后，子对象与外层实例操作区分处理。选择反馈以边线为主，不必期待整面覆盖高亮。

树上下文菜单提供显示/隐藏、显示子项、隔离、锁定等操作。父级隐藏/锁定影响后代，因此对象自己设为可见，也可能因父级仍看不到。检查源隐藏状态、父层级、隔离和裁剪平面。

控制点功能依赖保留的曲线、曲面或 SubD；只有显示网格的对象不具备原始 NURBS 控制点。精度调整和重网格化需要原始几何，纯渲染归档不保证支持。

## 5. 节点与计算状态

节点通过对应类型的输入/输出连接。可用常量、列表或数据树，匹配方式以节点定义为准。可将多个节点组织为 Group，并通过右键执行删除等命令。

拾取场景对象使用 **Parameters → Geometry** 节点，再把输出接到目标节点。几何对象和材质描述不是同一种数据，不能互换。

**WASM 包不等于节点都能计算。** 七个注册包共 630 个节点目前主要完成发现、注册和端口定义；标记 Pending 的 `SolveInstance()` 会提示未实现并清空输出。节点能加入画布不代表算法已完成；已实现的前端节点与这些注册包分开。详见 [节点包状态](WASM_NODE_PACKAGES.md)。

`.panda` 和 `.panda-render` 是模型归档，不保存节点图。请通过编辑器自身的图保存/加载功能另存节点图。

## 6. 网格精度与大模型

Display 提供 Minimal、Very coarse、Coarse、Low、Medium、High 六档。曲线采用距离与角度误差采样，直线无需切成大量等长小段。距离按模型单位计算；有原始几何的对象可随精度调整请求重新生成显示网格。

大文件先用低精度检查完整性，再按需要提高。多个 Mesh Worker 可并行独立任务，但扫描、依赖解析、单个大对象、主线程挂载和 GPU 上传仍可能成为瓶颈。内存不足时更多 Worker 可能更慢。

小对象合批减少绘制次数，同时保留对象身份与选择/编辑逻辑；它不会消除解析或网格化耗时。频繁打开同一模型时，保存本地归档再读取显示缓存通常比反复转换源文件合适。

## 7. 材质与 UV

在 **Scene Material** 节点选择导入材质，调整颜色、金属度、粗糙度、透明度、透射、IOR 和支持的贴图。材质类型不同，字段意义不同。材质球用于快速预览，真实场景仍受灯光、尺度、背景与几何封闭性影响。

相同名称且外观/贴图状态相同的材质可以共享；名称不同不会仅因参数相同而合并。修改共享材质会影响引用对象。选择场景对象用于定位对应材质；选择材质本身不应选中所有引用对象。

**UV Edit** 调整受支持的映射/变换与 repeat，**UV Match** 从源对象匹配到目标对象。使用 Geometry 节点提供目标，检查原始 UV 是否可用。贴图 repeat、UV 变换和贴图自身变换会共同作用，避免重复缩放。

## 8. 渲染设置

### 连接节点

1. 添加并启用 **Render Output**。
2. 添加 Environment、灯光、Quality、Render Effects 和相机描述节点。
3. 输出接到 Render Output 的 Environment、Lights、Quality、Effects、Camera 对应端口。
4. 显式绑定材质时，Geometry 提供 Targets，材质描述提供 Material，经 Material Assignment 接到 Bindings。
5. Render Output 选择 `raster`（实时）或 `pathtrace`（路径追踪），输入连接可覆盖对应控件值。
6. 静止相机等待收敛，通过 Export Image 和导出尺寸/采样参数输出图像。

HDR/贴图使用自己的资源；仓库不附带汽车案例、HDR 环境和完整 PBR 素材库。

### 实时模式

包括阴影过滤、抗锯齿、SSAO、环境/平面/屏幕空间反射、地面和分层玻璃合成。阴影范围应覆盖主体但不过大，否则固定大小的 shadow map 会降低空间精度。提高阴影/反射分辨率、增加玻璃复杂度会增加 GPU 和显存开销。

磨砂使用逐像素背景距离，同一物体不同像素可产生不同模糊。**Frost distance at roughness 0.5** 默认 1000 模型单位：毫米模型对应 1 米，米模型应填 1。参考距离附近 `roughness=0.5` 有强扩散；0 保留清晰透射，1 达到最大细节扩散。透射/不透明度仍控制通过的光量，最大磨砂不等于完全不透光。

这是有限层数的屏幕空间近似，不保证交叠玻璃、遮挡边缘、屏幕外物体和多次折射完全正确。环境、平面与屏幕空间反射的覆盖能力不同，并非所有曲面都能反射完整场景。

### 路径追踪

使用 three-gpu-pathtracer 0.0.23，隔离新版 Three/BVH 运行库。支持受支持材质的反射、玻璃透射/IOR、纹理、灯光/HDR、渐进采样与空间降噪。需要 WebGL2 和浮点目标，不是 CUDA、Cycles 或 Eevee。

BVH 构建可能耗时且占内存，实例转换也可能扩展几何。相机/场景变化会重置相关采样。降噪可能抹掉贴图细节，应对比关闭时的结果。实时磨砂的参考距离函数不会套到路径追踪中。复杂介质嵌套、精确焦散和全部高级材质特性并不保证，见 [实现与限制](PATH_TRACER_MIGRATION.md)。

## 9. 保存与重开

| 操作 | 内容 |
| --- | --- |
| Save locally | `.panda`：可保留的原始几何、显示缓存、材质与设置。 |
| Save as | 在选定位置保存完整文档副本。 |
| Save render data | `.panda-render`：网格/线/点、层级、变换、材质、支持的贴图/HDR、渲染设置，不含原始 CAD 几何。 |
| Open folder | 打开完整文档归档目录。 |
| Import render data | 读取渲染数据，适合显示与材质调整，不能当作完整 CAD 几何。 |

**当前 Frontend 的 Document Manager 保存按钮仍调用系统目录选择器，重复保存也会弹出。** Preview 的目录绑定/保存策略未移植，不要按 Preview 推断这里会自动覆盖原目录。

选择父文件夹后，在下面生成项目子目录：

```text
selected-parent/
  DocumentName-documentId.panda-render/
    document.json
    current-0.json
    current-1.json           # 后续提交可能出现
    commits/
    indexes/
    packs/
```

完整文档后缀为 `.panda`。首次保存可能只有一个 current 指针。记录按约 10 MiB 打包，单个大记录保持完整；两个提交指针用于失败恢复。复制/迁移时保留整个目录，不能只复制一个指针或 pack。

材质库、可编码纹理与支持的 HDR 输入随文档保存，GPU 缓存重建。旧归档本来缺失的材质/图片不能凭空恢复；保存也不会修复导入阶段已缺失的面。详见 [存储结构](LOCAL_DOCUMENT_STORAGE.md)，其中历史记录应结合本文的当前 UI 行为阅读。

## 10. 常见问题

| 现象 | 检查 |
| --- | --- |
| 无目录选择接口 | 桌面 Chrome/Edge，HTTPS 或 localhost，检查 `window.isSecureContext`；普通局域网 HTTP 不满足要求。 |
| 选目录后 AbortError / 权限失败 | 检查站点文件编辑权限、目录可写性与浏览器策略。未主动取消也可能收到 AbortError，不表示保存成功。 |
| Must be handling a user gesture | 从真实按钮点击触发选择器；断点、异步延迟或控制台调用可能丢失临时用户激活。 |
| 父目录看似没文件 | 查找文档名-ID的项目子目录，并确认界面报告成功。 |
| No complete Panda document | 选真正的归档子目录，确保 current 指针及引用的 commits/indexes/packs 完整。 |
| 有边线无网格 | 检查是否仍在生成以及部分失败提示，适当降低精度和并行数。 |
| 部分对象看不到 | 检查源隐藏、父层级、隔离、裁剪和导入警告。 |
| 只反射环境 | 检查场景反射/地面设置，注意屏幕空间和平面反射覆盖范围。 |
| 玻璃过糊 | 核对模型单位、Frost distance、两种粗糙度；路径追踪另查降噪和采样。 |
| 路径追踪回退/很慢 | 看状态原因，检查 WebGL2、显存、分辨率、纹理/几何规模及不支持材质。 |
| 节点无输出 | 查输入类型、连接和状态；Pending WASM 节点尚未实现计算。 |
| 无后端时公共文档不可用 | 属于部署范围限制，本地导入无需登录；协作需兼容后端。 |

## 11. 构建和部署

```sh
yarn test
yarn build
yarn check:release
```

部署整个 `dist/spa` 到站点根路径，推荐 HTTPS。不能双击 `index.html` 用 `file://` 部署。Worker/WASM/运行库需全部可访问。纯前端部署 `/api` 应返回明确的 503 JSON，不能回退成 SPA HTML；使用后端时配置 API/WebSocket 反向代理。

浏览器回归测试需另备 Playwright/浏览器环境，默认 `yarn test` 只验证编辑器/图逻辑，不证明全部 CAD 格式和渲染效果均经过完整认证。进一步阅读：[STEP](STEP_IMPORT.md)、[SKP](SKP_IMPORT.md)、[WASM 节点](WASM_NODE_PACKAGES.md)、[渲染](PATH_TRACER_MIGRATION.md)、[同步记录](FRONTEND_CHANGELOG.md)。
