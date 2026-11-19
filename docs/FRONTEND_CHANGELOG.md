# Frontend change log

All hashes are SHA-256. Entries are ordered by successful synchronization.

## 93eb80d2c8a4ad7785cd7c47f196aed34b1209b081f95e14cca12a1c3cbfed05

Message: Implement progressive STEP Part21 dependency jobs with incremental scene display, cancellation and timings; preserve assembly transforms/units/colors in AP203/AP214 tests; add audited selective synchronization and development policy

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| AGENTS.md | absent | absent | b34c920737af9e255af1a3fc57086176846256822792c93337eb6b6dd4b0e330 | b34c920737af9e255af1a3fc57086176846256822792c93337eb6b6dd4b0e330 | yes |
| docs/FRONTEND_SYNC.md | absent | absent | aabcbfe2c52b84b7d2a2cb7813aa8120c9af92d114e8005a676aa3cb4032b65f | aabcbfe2c52b84b7d2a2cb7813aa8120c9af92d114e8005a676aa3cb4032b65f | no |
| docs/STEP_IMPORT.md | absent | absent | f3834ef784e260f7d81d5ca862c296c81cdfdd511eb2911f60243526d3d4be99 | f3834ef784e260f7d81d5ca862c296c81cdfdd511eb2911f60243526d3d4be99 | no |
| scripts/sync-frontend-export.cjs | absent | absent | c7d6e455bd90cd7b766018d4519cd55d6e9984cc737ae0fc198aa1c7fccfa243 | c7d6e455bd90cd7b766018d4519cd55d6e9984cc737ae0fc198aa1c7fccfa243 | no |
| scripts/test-cad-frontend-import.js | absent | absent | 4171e16bd44871f3e9e46a4e339cad1c87242bc595438b32c9bbec47cb21841c | 4171e16bd44871f3e9e46a4e339cad1c87242bc595438b32c9bbec47cb21841c | no |
| scripts/test-step-part21.cjs | absent | absent | 9ad08ae10517bdfb6ae067ac7f02783074fd5741ea153fe00d629024d4fd896d | 9ad08ae10517bdfb6ae067ac7f02783074fd5741ea153fe00d629024d4fd896d | no |
| scripts/test-step-progressive-browser.cjs | absent | absent | 8811f95cd342a1ded0143b207c83def3026e89007ba42d20635677162e7626af | 8811f95cd342a1ded0143b207c83def3026e89007ba42d20635677162e7626af | no |
| scripts/test-step-progressive.cjs | absent | absent | 6137abe71770420770028351e7bde44309461df6f8138a35a4d3a76567dee9a1 | 6137abe71770420770028351e7bde44309461df6f8138a35a4d3a76567dee9a1 | no |
| scripts/test-sync-frontend-export.cjs | absent | absent | ef9f3949c6936e6307479bb6e21938428f41898f9d32c16d600bc67ce5cac90d | ef9f3949c6936e6307479bb6e21938428f41898f9d32c16d600bc67ce5cac90d | no |
| src/PandaUIApp.js | 60059f30f247931cf0023d44be16f3fe2fd85c5a90a8d4221f94821b58c7af6e | 60059f30f247931cf0023d44be16f3fe2fd85c5a90a8d4221f94821b58c7af6e | e8142bf2723b81481c3992028ec1f57437d4e2b968100aa849e3a7cb6f194a19 | e8142bf2723b81481c3992028ec1f57437d4e2b968100aa849e3a7cb6f194a19 | no |
| src/composables/useModelImport.js | 683e0b25feb587de74f53a237375e1b1e4b8861b6719ed253d3f252b0ef6a689 | 683e0b25feb587de74f53a237375e1b1e4b8861b6719ed253d3f252b0ef6a689 | 016c3eb2270724892c6d6797f2805778b67e61d9e630dd05473db89de5464cee | 016c3eb2270724892c6d6797f2805778b67e61d9e630dd05473db89de5464cee | no |
| src/import/CadFileImport.js | 1e3c351aba2b1344d70dfaac37e3d96bae727971823c8ec3fa5c20d87a2ef08d | 1e3c351aba2b1344d70dfaac37e3d96bae727971823c8ec3fa5c20d87a2ef08d | 5fe9a138c95f95ffbb60c781f76670726c51364784ffb14e47f4298c69384a28 | 5fe9a138c95f95ffbb60c781f76670726c51364784ffb14e47f4298c69384a28 | no |
| src/import/LocalImport.worker.js | 9e90f86fd7da58dcc47ffe357e84d2275e25350a7a69e1c5c7f016e9a7915282 | 9e90f86fd7da58dcc47ffe357e84d2275e25350a7a69e1c5c7f016e9a7915282 | b2f27c6a99ac4e44af5a8882116afc19dc84562fb1fa4696b48606635ad1635b | b2f27c6a99ac4e44af5a8882116afc19dc84562fb1fa4696b48606635ad1635b | no |
| src/import/ProgressiveStepImport.js | absent | absent | bf5efb0a290c19fc73bedf254e99bd44eef861a5fb2af3aadfc04b17fce70678 | bf5efb0a290c19fc73bedf254e99bd44eef861a5fb2af3aadfc04b17fce70678 | no |
| src/import/StepPart21.js | absent | absent | 43516082d080ad5b60e7fefb6dbb0ddf16376c492051a4e552d9e864693f5f5d | 43516082d080ad5b60e7fefb6dbb0ddf16376c492051a4e552d9e864693f5f5d | no |

## 8d174a9f2a85cfdbe4cbfeefb939c2b3d852edf8e2b1a6740dc980f5797c4ddf

Message: Preserve STEP whole-body invisibility, report unsupported visibility scopes, fix completed-job counts and final layer-tree merge; add hidden-instance and failed-part regressions

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | f3834ef784e260f7d81d5ca862c296c81cdfdd511eb2911f60243526d3d4be99 | f3834ef784e260f7d81d5ca862c296c81cdfdd511eb2911f60243526d3d4be99 | ebf0fbd1f2882fc1f2de07a5ed3bce08e1102cd47bf74314cb9abcee70fa02a0 | ebf0fbd1f2882fc1f2de07a5ed3bce08e1102cd47bf74314cb9abcee70fa02a0 | no |
| scripts/test-step-progressive-browser.cjs | 8811f95cd342a1ded0143b207c83def3026e89007ba42d20635677162e7626af | 8811f95cd342a1ded0143b207c83def3026e89007ba42d20635677162e7626af | 74487dc07e88fde96961935942a89a4840a9134543d99ab34b01b2ca79abfcff | 74487dc07e88fde96961935942a89a4840a9134543d99ab34b01b2ca79abfcff | no |
| scripts/test-step-progressive.cjs | 6137abe71770420770028351e7bde44309461df6f8138a35a4d3a76567dee9a1 | 6137abe71770420770028351e7bde44309461df6f8138a35a4d3a76567dee9a1 | cbe5e43fa33f7e5846e9e15c751f7f248e78b5736e7a3e6753f029246404d107 | cbe5e43fa33f7e5846e9e15c751f7f248e78b5736e7a3e6753f029246404d107 | no |
| src/PandaUIApp.js | e8142bf2723b81481c3992028ec1f57437d4e2b968100aa849e3a7cb6f194a19 | e8142bf2723b81481c3992028ec1f57437d4e2b968100aa849e3a7cb6f194a19 | 9615f8cf1ed9b67cecf6c711b41978126cf93368ff5a75b59723bb5fd081380c | 9615f8cf1ed9b67cecf6c711b41978126cf93368ff5a75b59723bb5fd081380c | no |
| src/import/ProgressiveStepImport.js | bf5efb0a290c19fc73bedf254e99bd44eef861a5fb2af3aadfc04b17fce70678 | bf5efb0a290c19fc73bedf254e99bd44eef861a5fb2af3aadfc04b17fce70678 | 45ff9de27a232f7e6685a8f918f28561abdbed55bc05787dcad7dedc71ba7712 | 45ff9de27a232f7e6685a8f918f28561abdbed55bc05787dcad7dedc71ba7712 | no |
| src/import/StepPart21.js | 43516082d080ad5b60e7fefb6dbb0ddf16376c492051a4e552d9e864693f5f5d | 43516082d080ad5b60e7fefb6dbb0ddf16376c492051a4e552d9e864693f5f5d | daf31f4ff72d205d4f1e815ae428c6c774d4fca600e86b70e9377986d05d99ab | daf31f4ff72d205d4f1e815ae428c6c774d4fca600e86b70e9377986d05d99ab | no |

## 21f9f71945175e6f929feb8135c285a4536ae63a0fbdfebbfdc59fdfdfd5ae63

Message: Finalize STEP visibility regression coverage; original and standalone production browser tests passed progressive display, hidden roots and cancellation without backend

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | ebf0fbd1f2882fc1f2de07a5ed3bce08e1102cd47bf74314cb9abcee70fa02a0 | ebf0fbd1f2882fc1f2de07a5ed3bce08e1102cd47bf74314cb9abcee70fa02a0 | 3b547b019c5e650c5f20720099d1d5c37f803c279e8b9a3ddaf36f6b23ce77c0 | 3b547b019c5e650c5f20720099d1d5c37f803c279e8b9a3ddaf36f6b23ce77c0 | no |
| scripts/test-step-part21.cjs | 9ad08ae10517bdfb6ae067ac7f02783074fd5741ea153fe00d629024d4fd896d | 9ad08ae10517bdfb6ae067ac7f02783074fd5741ea153fe00d629024d4fd896d | b47a8cd92d4e681cd28ddf2b680b4bf65106f8caf4744c2258d041636eb19f1d | b47a8cd92d4e681cd28ddf2b680b4bf65106f8caf4744c2258d041636eb19f1d | no |

## 9ff47184cf8d0b0a1556f0eed93636dcbc844bddcb937982c6bdbb4b244ceac1

Message: Add native STEP geometry decoding, analytic/NURBS evaluation, trimmed tessellation, assembly/unit/color preservation and per-job OCCT fallback; native and differential tests passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/FRONTEND_SYNC.md | aabcbfe2c52b84b7d2a2cb7813aa8120c9af92d114e8005a676aa3cb4032b65f | aabcbfe2c52b84b7d2a2cb7813aa8120c9af92d114e8005a676aa3cb4032b65f | ff6d1dccddc40664ae8e0ecb8479111d983151decbdcfb4976d962c2509b170a | ff6d1dccddc40664ae8e0ecb8479111d983151decbdcfb4976d962c2509b170a | no |
| docs/STEP_IMPORT.md | 3b547b019c5e650c5f20720099d1d5c37f803c279e8b9a3ddaf36f6b23ce77c0 | 3b547b019c5e650c5f20720099d1d5c37f803c279e8b9a3ddaf36f6b23ce77c0 | 080e1245dc5354424c6e89bfe5725491a5406512c0cef49a6982eae75b83938b | 080e1245dc5354424c6e89bfe5725491a5406512c0cef49a6982eae75b83938b | no |
| scripts/sync-frontend-export.cjs | c7d6e455bd90cd7b766018d4519cd55d6e9984cc737ae0fc198aa1c7fccfa243 | c7d6e455bd90cd7b766018d4519cd55d6e9984cc737ae0fc198aa1c7fccfa243 | 5d04c47cc412fcdeded1f3dd5f688a1c731a20b46561c128aa0ded721376db01 | 5d04c47cc412fcdeded1f3dd5f688a1c731a20b46561c128aa0ded721376db01 | no |
| scripts/test-step-native.cjs | absent | absent | 5f571e5e3d90567d1ed9e713a75391f7be2dd1dd2483e98e65289e9fce51b365 | 5f571e5e3d90567d1ed9e713a75391f7be2dd1dd2483e98e65289e9fce51b365 | no |
| scripts/test-step-progressive-browser.cjs | 74487dc07e88fde96961935942a89a4840a9134543d99ab34b01b2ca79abfcff | 74487dc07e88fde96961935942a89a4840a9134543d99ab34b01b2ca79abfcff | 32d4c582add3d2364b4621d9c84591b2379ff2bb5195ae1fd431871c19dae877 | 32d4c582add3d2364b4621d9c84591b2379ff2bb5195ae1fd431871c19dae877 | no |
| scripts/test-step-progressive.cjs | cbe5e43fa33f7e5846e9e15c751f7f248e78b5736e7a3e6753f029246404d107 | cbe5e43fa33f7e5846e9e15c751f7f248e78b5736e7a3e6753f029246404d107 | 5d430258c196c37926e3e22a20f12240cef0bdb04b1af011e6836eb89c62e369 | 5d430258c196c37926e3e22a20f12240cef0bdb04b1af011e6836eb89c62e369 | no |
| src/composables/useModelImport.js | 016c3eb2270724892c6d6797f2805778b67e61d9e630dd05473db89de5464cee | 016c3eb2270724892c6d6797f2805778b67e61d9e630dd05473db89de5464cee | 3ba40118fef7c7e7b093be7863648d4d9b2a078ddab5002cf7a2701e44f9b0fb | 3ba40118fef7c7e7b093be7863648d4d9b2a078ddab5002cf7a2701e44f9b0fb | no |
| src/import/ProgressiveStepImport.js | 45ff9de27a232f7e6685a8f918f28561abdbed55bc05787dcad7dedc71ba7712 | 45ff9de27a232f7e6685a8f918f28561abdbed55bc05787dcad7dedc71ba7712 | 183975c5aacb68dfad6e258f1e5c2b7f2dd01182f8422720e0280a9da41aa872 | 183975c5aacb68dfad6e258f1e5c2b7f2dd01182f8422720e0280a9da41aa872 | no |
| src/import/StepEntityModel.js | absent | absent | 787be9ce9fc329b6a45b71762ec96375d94efac9a09d96b076bcdf9d94a46fc7 | 787be9ce9fc329b6a45b71762ec96375d94efac9a09d96b076bcdf9d94a46fc7 | no |
| src/import/StepGeometry.js | absent | absent | 0091be8ce459fd7fac774289a82aedfb7c990f482c9f66d2e287801222294cea | 0091be8ce459fd7fac774289a82aedfb7c990f482c9f66d2e287801222294cea | no |
| src/import/StepNativeImport.js | absent | absent | 6127a65be05780d1c0bb0faf2945ced4c9804776107cdf7129baac109b326add | 6127a65be05780d1c0bb0faf2945ced4c9804776107cdf7129baac109b326add | no |

## d3f19d95e7d068fca10013ab060e98f4d504c9bae02a252018de79f43b05ba1b

Message: Merge same-material face groups into one draw group; verify native visibility and report converter coverage

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| scripts/test-step-native.cjs | 5f571e5e3d90567d1ed9e713a75391f7be2dd1dd2483e98e65289e9fce51b365 | 5f571e5e3d90567d1ed9e713a75391f7be2dd1dd2483e98e65289e9fce51b365 | fbad554b93d9f1a254e61dae412eeeec2e671ff9134d16aacae16414681751c0 | fbad554b93d9f1a254e61dae412eeeec2e671ff9134d16aacae16414681751c0 | no |
| scripts/test-step-progressive.cjs | 5d430258c196c37926e3e22a20f12240cef0bdb04b1af011e6836eb89c62e369 | 5d430258c196c37926e3e22a20f12240cef0bdb04b1af011e6836eb89c62e369 | 05cda8dac00be262bc303dab8352a952b6d1fd5f4633fdd418b905b3ed62e4db | 05cda8dac00be262bc303dab8352a952b6d1fd5f4633fdd418b905b3ed62e4db | no |
| src/import/StepNativeImport.js | 6127a65be05780d1c0bb0faf2945ced4c9804776107cdf7129baac109b326add | 6127a65be05780d1c0bb0faf2945ced4c9804776107cdf7129baac109b326add | 5842a4b4c1e2a1e75827e5dcb176beae0bc575f2e0efa17bea75eacc49b71b38 | 5842a4b4c1e2a1e75827e5dcb176beae0bc575f2e0efa17bea75eacc49b71b38 | no |

## d653d828fccedb9db182bbb90307b71c75986f4c9d50bffac4d879fdf4e59bce

Message: Validate full tangent-angle error including curve endpoints; native geometry and blocked-OCCT browser checks passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 080e1245dc5354424c6e89bfe5725491a5406512c0cef49a6982eae75b83938b | 080e1245dc5354424c6e89bfe5725491a5406512c0cef49a6982eae75b83938b | 2d4e0a25ab35d351d51a58a1d4930e652206d36b97df321d93fe4e7a148577f9 | 2d4e0a25ab35d351d51a58a1d4930e652206d36b97df321d93fe4e7a148577f9 | no |
| scripts/test-step-native.cjs | fbad554b93d9f1a254e61dae412eeeec2e671ff9134d16aacae16414681751c0 | fbad554b93d9f1a254e61dae412eeeec2e671ff9134d16aacae16414681751c0 | b070be3ca85b00ea988a27e49dd9bfe778dd96866d8d969569658b2bd73a5ff5 | b070be3ca85b00ea988a27e49dd9bfe778dd96866d8d969569658b2bd73a5ff5 | no |
| src/import/StepGeometry.js | 0091be8ce459fd7fac774289a82aedfb7c990f482c9f66d2e287801222294cea | 0091be8ce459fd7fac774289a82aedfb7c990f482c9f66d2e287801222294cea | 9ff61792dce862e181395e2d6d91ea40794aec34d4b921fb86c3917801087170 | 9ff61792dce862e181395e2d6d91ea40794aec34d4b921fb86c3917801087170 | no |

## eb3bb5357bfdd8549d038ef7474466c536b12f9b91266bc089714f9e9d9bcd42

Message: Finalize passing curve-angle regression and native geometry lint

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| scripts/test-step-native.cjs | b070be3ca85b00ea988a27e49dd9bfe778dd96866d8d969569658b2bd73a5ff5 | b070be3ca85b00ea988a27e49dd9bfe778dd96866d8d969569658b2bd73a5ff5 | 71b9062dbef8cf7d24540e5543aaba2bef22961147d7b3ec500793bd8fae6b19 | 71b9062dbef8cf7d24540e5543aaba2bef22961147d7b3ec500793bd8fae6b19 | no |
| src/import/StepGeometry.js | 9ff61792dce862e181395e2d6d91ea40794aec34d4b921fb86c3917801087170 | 9ff61792dce862e181395e2d6d91ea40794aec34d4b921fb86c3917801087170 | bfb30c6df35c3f31d3e50fc626be6573bf36bd65a655d80d07380833224c4b9a | bfb30c6df35c3f31d3e50fc626be6573bf36bd65a655d80d07380833224c4b9a | no |

## 88d74bc1af9997fd0eae9962b1920ec4351b4d4dc5de2eb1977223f73abc49d5

Message: Retain validated STEP Breps via NodeC with original NURBS data, topology, edge display, source archives, remeshing and publication. Original build, real Edge import/remesh/disposal, exact-WASM and STEP regressions passed; unsupported exact branches remain explicit display-only fallbacks.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/FRONTEND_SYNC.md | ff6d1dccddc40664ae8e0ecb8479111d983151decbdcfb4976d962c2509b170a | ff6d1dccddc40664ae8e0ecb8479111d983151decbdcfb4976d962c2509b170a | 447a3cd16a94310115f7c704e662a5f925ebc176e7a80f87ba5c09085871a681 | 447a3cd16a94310115f7c704e662a5f925ebc176e7a80f87ba5c09085871a681 | no |
| docs/STEP_IMPORT.md | 2d4e0a25ab35d351d51a58a1d4930e652206d36b97df321d93fe4e7a148577f9 | 2d4e0a25ab35d351d51a58a1d4930e652206d36b97df321d93fe4e7a148577f9 | 280d8fb0c52300c7d7017b049ddcf157316d4bd11cccb79116298dbb098cfc49 | 280d8fb0c52300c7d7017b049ddcf157316d4bd11cccb79116298dbb098cfc49 | no |
| public/nodec/NodeC.js | abad61331f669e64b08b264d7e03cc2921058a67214c2bc9e6f55ffeb4f46419 | abad61331f669e64b08b264d7e03cc2921058a67214c2bc9e6f55ffeb4f46419 | d609f535a61ddd32ec351df0006e338bfb8422eae82377399d8ebf042f8c2666 | d609f535a61ddd32ec351df0006e338bfb8422eae82377399d8ebf042f8c2666 | no |
| public/nodec/NodeC.wasm | 6dc6cb79c425ed3b3e9333eae44fe65d2ddc7c80f52e984c452d739474cf8294 | 6dc6cb79c425ed3b3e9333eae44fe65d2ddc7c80f52e984c452d739474cf8294 | 2aa041ce09b0d67b03984067c0e412ae9cd4ef2d4014a5af9f1c89ad81bbd395 | 2aa041ce09b0d67b03984067c0e412ae9cd4ef2d4014a5af9f1c89ad81bbd395 | no |
| scripts/sync-frontend-export.cjs | 5d04c47cc412fcdeded1f3dd5f688a1c731a20b46561c128aa0ded721376db01 | 5d04c47cc412fcdeded1f3dd5f688a1c731a20b46561c128aa0ded721376db01 | 4b2b7153ec4e6a752e7625a8126cc907836545b43aa4fa486c9fa2d4ec167299 | 4b2b7153ec4e6a752e7625a8126cc907836545b43aa4fa486c9fa2d4ec167299 | no |
| scripts/test-step-brep.cjs | absent | absent | 5f282ee437f69968c8f5fffd4206c375e68ede8c7aebd805ed0a4a9337d498ac | 5f282ee437f69968c8f5fffd4206c375e68ede8c7aebd805ed0a4a9337d498ac | no |
| scripts/test-step-progressive-browser.cjs | 32d4c582add3d2364b4621d9c84591b2379ff2bb5195ae1fd431871c19dae877 | 32d4c582add3d2364b4621d9c84591b2379ff2bb5195ae1fd431871c19dae877 | 591e4bd46984499614714f315ff50a7f3cd8234c5a810003e7a2c1dff42bb057 | 591e4bd46984499614714f315ff50a7f3cd8234c5a810003e7a2c1dff42bb057 | no |
| scripts/test-step-progressive.cjs | 05cda8dac00be262bc303dab8352a952b6d1fd5f4633fdd418b905b3ed62e4db | 05cda8dac00be262bc303dab8352a952b6d1fd5f4633fdd418b905b3ed62e4db | 0e21ecb904514b3467c8f3ddb62f39c5ef04f6542c9f691cec09a319a5506b06 | 0e21ecb904514b3467c8f3ddb62f39c5ef04f6542c9f691cec09a319a5506b06 | no |
| src/PandaUIApp.js | 9615f8cf1ed9b67cecf6c711b41978126cf93368ff5a75b59723bb5fd081380c | 9615f8cf1ed9b67cecf6c711b41978126cf93368ff5a75b59723bb5fd081380c | 677be021ac16d455276728d29c424a1dd3f50ee46a115973e49b3b591f5e2584 | 677be021ac16d455276728d29c424a1dd3f50ee46a115973e49b3b591f5e2584 | no |
| src/PandaUIDoc.js | 0a8ed9eb3409f75a77a161c27294d64c30fb695c574203450e5e52821144e6ec | 0a8ed9eb3409f75a77a161c27294d64c30fb695c574203450e5e52821144e6ec | fda9d82f22a525d517f87ff6a022447e16e1a646c7d16e2cfd9006e2709e201b | fda9d82f22a525d517f87ff6a022447e16e1a646c7d16e2cfd9006e2709e201b | no |
| src/collaboration/FrontendGeometryPublisher.js | 4f783b00268769960351c61c9eec42ae7dd0cb17709e2e5601906a507a06634e | 4f783b00268769960351c61c9eec42ae7dd0cb17709e2e5601906a507a06634e | 28b87b242793a57698a45a8359ff1517ac134313735bceddcee624c61305b4c7 | 28b87b242793a57698a45a8359ff1517ac134313735bceddcee624c61305b4c7 | no |
| src/composables/useModelImport.js | 3ba40118fef7c7e7b093be7863648d4d9b2a078ddab5002cf7a2701e44f9b0fb | 3ba40118fef7c7e7b093be7863648d4d9b2a078ddab5002cf7a2701e44f9b0fb | d4b5385e2fc56d048a14cfbc8f2e418600d509a544e0a49353f560246cf72695 | d4b5385e2fc56d048a14cfbc8f2e418600d509a544e0a49353f560246cf72695 | no |
| src/import/DisplayObjectImport.js | 591fba4dfbe66648a825104f917f3d3c01903d1267dde8b0bf6a7cf23e85e644 | 591fba4dfbe66648a825104f917f3d3c01903d1267dde8b0bf6a7cf23e85e644 | c059c31cac41b20403233d6a26b64f2a70a7474f30832a03369a5fbc98047b40 | c059c31cac41b20403233d6a26b64f2a70a7474f30832a03369a5fbc98047b40 | no |
| src/import/LocalImport.worker.js | b2f27c6a99ac4e44af5a8882116afc19dc84562fb1fa4696b48606635ad1635b | b2f27c6a99ac4e44af5a8882116afc19dc84562fb1fa4696b48606635ad1635b | cedf150821f26d022aabbda8aa807af606c64ab04c8d6b458d9eed7358e72ed9 | cedf150821f26d022aabbda8aa807af606c64ab04c8d6b458d9eed7358e72ed9 | no |
| src/import/ProgressiveStepImport.js | 183975c5aacb68dfad6e258f1e5c2b7f2dd01182f8422720e0280a9da41aa872 | 183975c5aacb68dfad6e258f1e5c2b7f2dd01182f8422720e0280a9da41aa872 | 29064fdc8a2b641ab3693967afc607c3d6b227dd2b0f806982ae6a71ea5343c3 | 29064fdc8a2b641ab3693967afc607c3d6b227dd2b0f806982ae6a71ea5343c3 | no |
| src/import/StepBrep.js | absent | absent | 585e32f1467f467c2420338badaee0ffca39d1dfb087632e1270bb8ad92a7849 | 585e32f1467f467c2420338badaee0ffca39d1dfb087632e1270bb8ad92a7849 | no |
| src/import/StepGeometry.js | bfb30c6df35c3f31d3e50fc626be6573bf36bd65a655d80d07380833224c4b9a | bfb30c6df35c3f31d3e50fc626be6573bf36bd65a655d80d07380833224c4b9a | 4168e5d4720d0be19276b7a3ccea9b636746e72635015c80d3c4929e0dbee04e | 4168e5d4720d0be19276b7a3ccea9b636746e72635015c80d3c4929e0dbee04e | no |
| src/import/StepNativeImport.js | 5842a4b4c1e2a1e75827e5dcb176beae0bc575f2e0efa17bea75eacc49b71b38 | 5842a4b4c1e2a1e75827e5dcb176beae0bc575f2e0efa17bea75eacc49b71b38 | 788ba92bf0efe4a12b97eb81c4f92d7b96816dd781aef19e0ece1e007b4c7703 | 788ba92bf0efe4a12b97eb81c4f92d7b96816dd781aef19e0ece1e007b4c7703 | no |
| src/import/remeshLocalDocument.js | 6aebe9f32c1bbdf2d7a5cef87b9a0d69d850abdbe9f93fa7bb852b7cbb7eee7e | 6aebe9f32c1bbdf2d7a5cef87b9a0d69d850abdbe9f93fa7bb852b7cbb7eee7e | 5687344fbc4dc4112a608799735a76841677f6f041210bb5f837abaf09e70edd | 5687344fbc4dc4112a608799735a76841677f6f041210bb5f837abaf09e70edd | no |
| src/modeling/ControlPointGeometrySource.js | 63b6a8ce8fba056920dbbdfae6664d0cd32c5657cdb6fe9f3272030950c1d218 | 63b6a8ce8fba056920dbbdfae6664d0cd32c5657cdb6fe9f3272030950c1d218 | 5f4b1445d327698e12428b3c6be16bb79de2eb1fb2653c737e69ae4f54fd64a4 | 5f4b1445d327698e12428b3c6be16bb79de2eb1fb2653c737e69ae4f54fd64a4 | no |

## 87f1352bb80d3bf334b0c68d285c1cf7b2cfee1ae4661e430c7477396c21635a

Message: Record passing original/standalone builds, real-browser exact Brep remeshing and cleanup, native publication coverage, and release check.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 280d8fb0c52300c7d7017b049ddcf157316d4bd11cccb79116298dbb098cfc49 | 280d8fb0c52300c7d7017b049ddcf157316d4bd11cccb79116298dbb098cfc49 | 2cf50e9ba88377384fe5774153ee4ed05cdb954ef3ec5d4919b2faa58c9cb29d | 2cf50e9ba88377384fe5774153ee4ed05cdb954ef3ec5d4919b2faa58c9cb29d | no |
| scripts/test-step-brep.cjs | 5f282ee437f69968c8f5fffd4206c375e68ede8c7aebd805ed0a4a9337d498ac | 5f282ee437f69968c8f5fffd4206c375e68ede8c7aebd805ed0a4a9337d498ac | 62fdfe4fe3c268d54c0849022994b58bbfe8f3c92dd7c34bf6cac132c96034a8 | 62fdfe4fe3c268d54c0849022994b58bbfe8f3c92dd7c34bf6cac132c96034a8 | no |

## 76d603aff6218ad708d71779325fb6dcec539ac0fa45765c553ee4d99442da1a

Message: Extend exact STEP Breps with parameter-compatible cylinders/cones, signed angles, shared seams and two-ring UV recovery. Validation: WASM exact/fallback regressions, native and progressive suites, ESLint, source production build and offline Edge import/remesh passed. Native C++ and private REA evidence remain source-only.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 2cf50e9ba88377384fe5774153ee4ed05cdb954ef3ec5d4919b2faa58c9cb29d | 2cf50e9ba88377384fe5774153ee4ed05cdb954ef3ec5d4919b2faa58c9cb29d | 0fedc471511cb7604afc9802dc45a151ed8c5821782499463a66b2681d030996 | 0fedc471511cb7604afc9802dc45a151ed8c5821782499463a66b2681d030996 | no |
| public/nodec/NodeC.js | d609f535a61ddd32ec351df0006e338bfb8422eae82377399d8ebf042f8c2666 | d609f535a61ddd32ec351df0006e338bfb8422eae82377399d8ebf042f8c2666 | 23f6424103d3f66384c766994c2360e858f04e483ad8882911f6428a740f025f | 23f6424103d3f66384c766994c2360e858f04e483ad8882911f6428a740f025f | no |
| public/nodec/NodeC.wasm | 2aa041ce09b0d67b03984067c0e412ae9cd4ef2d4014a5af9f1c89ad81bbd395 | 2aa041ce09b0d67b03984067c0e412ae9cd4ef2d4014a5af9f1c89ad81bbd395 | 1eea45cf78c12da1c6549850a7815d691076bfee6edada1e0c9889ac5460513a | 1eea45cf78c12da1c6549850a7815d691076bfee6edada1e0c9889ac5460513a | no |
| scripts/test-step-brep.cjs | 62fdfe4fe3c268d54c0849022994b58bbfe8f3c92dd7c34bf6cac132c96034a8 | 62fdfe4fe3c268d54c0849022994b58bbfe8f3c92dd7c34bf6cac132c96034a8 | 8bfbb47465c1fc233cdb6d038b9e9be1da272512e6aa3d547283b90d7ccea228 | 8bfbb47465c1fc233cdb6d038b9e9be1da272512e6aa3d547283b90d7ccea228 | no |
| scripts/test-step-progressive-browser.cjs | 591e4bd46984499614714f315ff50a7f3cd8234c5a810003e7a2c1dff42bb057 | 591e4bd46984499614714f315ff50a7f3cd8234c5a810003e7a2c1dff42bb057 | c2d6e7d017b18a4ad5952aeee39c20880ff96c689d1a8d9807b842a1b1d72589 | c2d6e7d017b18a4ad5952aeee39c20880ff96c689d1a8d9807b842a1b1d72589 | no |
| src/import/StepBrep.js | 585e32f1467f467c2420338badaee0ffca39d1dfb087632e1270bb8ad92a7849 | 585e32f1467f467c2420338badaee0ffca39d1dfb087632e1270bb8ad92a7849 | bc7d1b14a85e8940e38b5148e72bfa99ecf3c98b3eeb6793d4024c6a450ebe0a | bc7d1b14a85e8940e38b5148e72bfa99ecf3c98b3eeb6793d4024c6a450ebe0a | no |
| src/import/StepRevolvedTrim.js | absent | absent | 0386b5474ea3d919cced970c5fab0259e4a67b499585f8b94fdc575b33160f49 | 0386b5474ea3d919cced970c5fab0259e4a67b499585f8b94fdc575b33160f49 | no |

## 8ee8fa377ef0d2c5dd154d7bec2258cdb1290054a83707162976a9f66273b2b5

Message: Record completed analytic STEP validation: both production builds and offline Edge regressions pass; exact signed-cone/seam tests and standalone release check (389 files) pass

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 0fedc471511cb7604afc9802dc45a151ed8c5821782499463a66b2681d030996 | 0fedc471511cb7604afc9802dc45a151ed8c5821782499463a66b2681d030996 | c8470aeedcd1a6b984e310420f1203b945298e6880325c78b54c9eb0ddc02cec | c8470aeedcd1a6b984e310420f1203b945298e6880325c78b54c9eb0ddc02cec | no |

## cf8a3af85018b0e5c77524524bace7500f4141f71fc122f04b31103e7c556acc

Message: Implement OpenNURBS-first STEP import and diagnostics

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | c8470aeedcd1a6b984e310420f1203b945298e6880325c78b54c9eb0ddc02cec | c8470aeedcd1a6b984e310420f1203b945298e6880325c78b54c9eb0ddc02cec | ea67b45a10ca8a4ef81c64758fa2c5b742b7b2bbe47655d12f02d4159b2d7dc3 | ea67b45a10ca8a4ef81c64758fa2c5b742b7b2bbe47655d12f02d4159b2d7dc3 | no |
| scripts/test-step-opennurbs.cjs | absent | absent | 11082f8a6264f36e5f63756425427a21ddca4c1d19912a9d698bb0a35fc14bc2 | 11082f8a6264f36e5f63756425427a21ddca4c1d19912a9d698bb0a35fc14bc2 | no |
| scripts/test-step-progressive-browser.cjs | c2d6e7d017b18a4ad5952aeee39c20880ff96c689d1a8d9807b842a1b1d72589 | c2d6e7d017b18a4ad5952aeee39c20880ff96c689d1a8d9807b842a1b1d72589 | 5318141d3aa9d9d849cba6e441887ba7720e90289e71e59d1a1abf39a10a5795 | 5318141d3aa9d9d849cba6e441887ba7720e90289e71e59d1a1abf39a10a5795 | no |
| src/PandaUIApp.js | 677be021ac16d455276728d29c424a1dd3f50ee46a115973e49b3b591f5e2584 | 677be021ac16d455276728d29c424a1dd3f50ee46a115973e49b3b591f5e2584 | 20eb11bda5db10fa679615ce26e2e127e69ed8347ba3354e78d1af7c0d681a36 | 20eb11bda5db10fa679615ce26e2e127e69ed8347ba3354e78d1af7c0d681a36 | no |
| src/PandaUIDoc.js | fda9d82f22a525d517f87ff6a022447e16e1a646c7d16e2cfd9006e2709e201b | fda9d82f22a525d517f87ff6a022447e16e1a646c7d16e2cfd9006e2709e201b | b4d435156d3455cae08e0880560c32f8857dd0154612ebffb041971420e2c75c | b4d435156d3455cae08e0880560c32f8857dd0154612ebffb041971420e2c75c | no |
| src/import/ImportMeshFeed.js | dfc4f8dbeab6d7c50d44cd37623f5c35e92155271a9b806d86828ea3decde515 | dfc4f8dbeab6d7c50d44cd37623f5c35e92155271a9b806d86828ea3decde515 | 5dcd97930a65c3c6f02c1722d2da1e2da6f7acba085c8979a65cef8e44dfcf6f | 5dcd97930a65c3c6f02c1722d2da1e2da6f7acba085c8979a65cef8e44dfcf6f | no |
| src/import/ProgressiveStepImport.js | 29064fdc8a2b641ab3693967afc607c3d6b227dd2b0f806982ae6a71ea5343c3 | 29064fdc8a2b641ab3693967afc607c3d6b227dd2b0f806982ae6a71ea5343c3 | 0ec64b955338111875808f0e6d698786681bc53513d9c6df9d7e39a1e8009b64 | 0ec64b955338111875808f0e6d698786681bc53513d9c6df9d7e39a1e8009b64 | no |
| src/import/StepBrep.js | bc7d1b14a85e8940e38b5148e72bfa99ecf3c98b3eeb6793d4024c6a450ebe0a | bc7d1b14a85e8940e38b5148e72bfa99ecf3c98b3eeb6793d4024c6a450ebe0a | 421db7c29d56635f78ea0d9231d1df8b3408b3b3063c8bd93744cbb40fa8d094 | 421db7c29d56635f78ea0d9231d1df8b3408b3b3063c8bd93744cbb40fa8d094 | no |
| src/import/StepOpenNurbsImport.js | absent | absent | 557a55c5ca9af92a2f45583016714363388acafb1a9267d93a3f7390005645e9 | 557a55c5ca9af92a2f45583016714363388acafb1a9267d93a3f7390005645e9 | no |
| src/import/remeshLocalDocument.js | 5687344fbc4dc4112a608799735a76841677f6f041210bb5f837abaf09e70edd | 5687344fbc4dc4112a608799735a76841677f6f041210bb5f837abaf09e70edd | 636cff1cd594bf70b9edfdb75e62dab07db54cba32721788f7ff3acd6888f64e | 636cff1cd594bf70b9edfdb75e62dab07db54cba32721788f7ff3acd6888f64e | no |

## 971e94d56f6bb338db78ff30bb276e49a8c373ac4461dd9454840b8ae34000ec

Message: Update native STEP runtime after OpenNURBS conversion

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/nodec/NodeC.js | 23f6424103d3f66384c766994c2360e858f04e483ad8882911f6428a740f025f | 23f6424103d3f66384c766994c2360e858f04e483ad8882911f6428a740f025f | 762bfbd040c568e88ada444b0a1669ba325d92ca34f399fec9c83f8e032dc981 | 762bfbd040c568e88ada444b0a1669ba325d92ca34f399fec9c83f8e032dc981 | no |
| public/nodec/NodeC.wasm | 1eea45cf78c12da1c6549850a7815d691076bfee6edada1e0c9889ac5460513a | 1eea45cf78c12da1c6549850a7815d691076bfee6edada1e0c9889ac5460513a | a9b991f74200790981d36a3ae320702bfb028aa3f8e7dd0f6fa50cf653513130 | a9b991f74200790981d36a3ae320702bfb028aa3f8e7dd0f6fa50cf653513130 | no |

## a075efe94ce1681fcdbe96244d2973b90dd4c0b594b2aad64341c8135d22cb35

Message: Document real STEP OpenNURBS validation limits

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | ea67b45a10ca8a4ef81c64758fa2c5b742b7b2bbe47655d12f02d4159b2d7dc3 | ea67b45a10ca8a4ef81c64758fa2c5b742b7b2bbe47655d12f02d4159b2d7dc3 | 080db887e1a3cb57f3a846e8913c13b67037449f08c736c9638e408d19afc621 | 080db887e1a3cb57f3a846e8913c13b67037449f08c736c9638e408d19afc621 | no |

## 03d49bb0754bc673b95ba49421d7f0d78e8d650eb2a3812d48788219a2d3e731

Message: Separate STEP UV fitting from repair; fix anchor projection and actual shared seams; native model 66/70 with measured fit below target; restore export metadata dependencies

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/FRONTEND_SYNC.md | 447a3cd16a94310115f7c704e662a5f925ebc176e7a80f87ba5c09085871a681 | 447a3cd16a94310115f7c704e662a5f925ebc176e7a80f87ba5c09085871a681 | c3880ccccc448d28ae6cadd6f61ccbdcbe013a87eee530b42a3cd967964fccb9 | c3880ccccc448d28ae6cadd6f61ccbdcbe013a87eee530b42a3cd967964fccb9 | no |
| docs/STEP_IMPORT.md | 080db887e1a3cb57f3a846e8913c13b67037449f08c736c9638e408d19afc621 | 080db887e1a3cb57f3a846e8913c13b67037449f08c736c9638e408d19afc621 | d12ee20d968a92edb6a67b3423213181040b8edf32981c8e6257f46971f42f4c | d12ee20d968a92edb6a67b3423213181040b8edf32981c8e6257f46971f42f4c | no |
| public/nodec/NodeC.js | 762bfbd040c568e88ada444b0a1669ba325d92ca34f399fec9c83f8e032dc981 | 762bfbd040c568e88ada444b0a1669ba325d92ca34f399fec9c83f8e032dc981 | 2445cc20e00ef421e309532ecab0cd364a7baba6f139b1ace75c38fa9076cce8 | 2445cc20e00ef421e309532ecab0cd364a7baba6f139b1ace75c38fa9076cce8 | no |
| public/nodec/NodeC.wasm | a9b991f74200790981d36a3ae320702bfb028aa3f8e7dd0f6fa50cf653513130 | a9b991f74200790981d36a3ae320702bfb028aa3f8e7dd0f6fa50cf653513130 | a34669cee2a0071f823da13572389689fb39b8edba48f0cbd8fd8028689ebb1c | a34669cee2a0071f823da13572389689fb39b8edba48f0cbd8fd8028689ebb1c | no |
| scripts/sync-frontend-export.cjs | 4b2b7153ec4e6a752e7625a8126cc907836545b43aa4fa486c9fa2d4ec167299 | 4b2b7153ec4e6a752e7625a8126cc907836545b43aa4fa486c9fa2d4ec167299 | 6da44147bf425896e8752f24ebb93b31e9bf57ae3071d8dfe655b553bd83f337 | 6da44147bf425896e8752f24ebb93b31e9bf57ae3071d8dfe655b553bd83f337 | no |
| scripts/test-step-brep.cjs | 8bfbb47465c1fc233cdb6d038b9e9be1da272512e6aa3d547283b90d7ccea228 | 8bfbb47465c1fc233cdb6d038b9e9be1da272512e6aa3d547283b90d7ccea228 | 7e4b1b8e1a343f70a4c56f376c5056ffaed18778bf767423e239676c40778b7c | 7e4b1b8e1a343f70a4c56f376c5056ffaed18778bf767423e239676c40778b7c | no |
| scripts/test-step-progressive-browser.cjs | 5318141d3aa9d9d849cba6e441887ba7720e90289e71e59d1a1abf39a10a5795 | 5318141d3aa9d9d849cba6e441887ba7720e90289e71e59d1a1abf39a10a5795 | 56480b285a926273c8e51ee1b9cf54b5ffd179450975b902116c222127bcebb9 | 56480b285a926273c8e51ee1b9cf54b5ffd179450975b902116c222127bcebb9 | no |
| src/import/ProgressiveStepImport.js | 0ec64b955338111875808f0e6d698786681bc53513d9c6df9d7e39a1e8009b64 | 0ec64b955338111875808f0e6d698786681bc53513d9c6df9d7e39a1e8009b64 | 6f1f84f4f90fed882e69145008ed518afd3d795c31ca9c6f836798a1c3a1ae8e | 6f1f84f4f90fed882e69145008ed518afd3d795c31ca9c6f836798a1c3a1ae8e | no |
| src/import/StepBrep.js | 421db7c29d56635f78ea0d9231d1df8b3408b3b3063c8bd93744cbb40fa8d094 | 421db7c29d56635f78ea0d9231d1df8b3408b3b3063c8bd93744cbb40fa8d094 | e8b1a173994ae8f5b3c334ee321b0568a8e5a7c592d39f8c0c31bea761f8048d | e8b1a173994ae8f5b3c334ee321b0568a8e5a7c592d39f8c0c31bea761f8048d | no |
| src/import/StepNativeImport.js | 788ba92bf0efe4a12b97eb81c4f92d7b96816dd781aef19e0ece1e007b4c7703 | 788ba92bf0efe4a12b97eb81c4f92d7b96816dd781aef19e0ece1e007b4c7703 | 926986bf19dd4ec2d404665fe8d543ca60094571907330c22da3da0361d72398 | 926986bf19dd4ec2d404665fe8d543ca60094571907330c22da3da0361d72398 | no |

## aadc96c9b72616870cb9bb28604d7ca33e7f4fb9f940631b7ab4cbbdd3781963

Message: Fix remaining STEP periodic and projection failures; native 70/70 objects pass with exact shared-edge subdivision

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | d12ee20d968a92edb6a67b3423213181040b8edf32981c8e6257f46971f42f4c | d12ee20d968a92edb6a67b3423213181040b8edf32981c8e6257f46971f42f4c | 5a9a8b832ac3190eb0b522edad9226a4fb82b158444dd3f8ffba37a1fca3b882 | 5a9a8b832ac3190eb0b522edad9226a4fb82b158444dd3f8ffba37a1fca3b882 | no |
| public/nodec/NodeC.js | 2445cc20e00ef421e309532ecab0cd364a7baba6f139b1ace75c38fa9076cce8 | 2445cc20e00ef421e309532ecab0cd364a7baba6f139b1ace75c38fa9076cce8 | 91bff929492dc23072b16e54dd469c0ecbf49f744fde2a1b35269bd40c290918 | 91bff929492dc23072b16e54dd469c0ecbf49f744fde2a1b35269bd40c290918 | no |
| public/nodec/NodeC.wasm | a34669cee2a0071f823da13572389689fb39b8edba48f0cbd8fd8028689ebb1c | a34669cee2a0071f823da13572389689fb39b8edba48f0cbd8fd8028689ebb1c | 30df1e5118dd4c1f3018b9d69fe9c29fdcbc65a6c36ec007cd3847ade2c49fdd | 30df1e5118dd4c1f3018b9d69fe9c29fdcbc65a6c36ec007cd3847ade2c49fdd | no |
| scripts/test-step-brep.cjs | 7e4b1b8e1a343f70a4c56f376c5056ffaed18778bf767423e239676c40778b7c | 7e4b1b8e1a343f70a4c56f376c5056ffaed18778bf767423e239676c40778b7c | 8c062116252aa5d59ce0e87b4378443c411c0d9199226b770d795e2e6d979602 | 8c062116252aa5d59ce0e87b4378443c411c0d9199226b770d795e2e6d979602 | no |
| scripts/test-step-opennurbs.cjs | 11082f8a6264f36e5f63756425427a21ddca4c1d19912a9d698bb0a35fc14bc2 | 11082f8a6264f36e5f63756425427a21ddca4c1d19912a9d698bb0a35fc14bc2 | 10e21322083c4fb36105e354699c0ec6d25bb568964baa46b3bc052dcb865c3e | 10e21322083c4fb36105e354699c0ec6d25bb568964baa46b3bc052dcb865c3e | no |
| scripts/test-step-progressive-browser.cjs | 56480b285a926273c8e51ee1b9cf54b5ffd179450975b902116c222127bcebb9 | 56480b285a926273c8e51ee1b9cf54b5ffd179450975b902116c222127bcebb9 | 0059e2131e32955745251576bba18762fe67b5b57cce3e899407a345d6fd478e | 0059e2131e32955745251576bba18762fe67b5b57cce3e899407a345d6fd478e | no |
| src/import/StepOpenNurbsImport.js | 557a55c5ca9af92a2f45583016714363388acafb1a9267d93a3f7390005645e9 | 557a55c5ca9af92a2f45583016714363388acafb1a9267d93a3f7390005645e9 | acd16258c267a6ec30d1581f46a4c373d00ad915cbbff0b62846b90842f623cc | acd16258c267a6ec30d1581f46a4c373d00ad915cbbff0b62846b90842f623cc | no |

## 14dcf67206c1f72de2db7e71cb4f9149c139da1d23ca641b6334da315830afd4

Message: Record full STEP browser validation: 70 native objects, complete edge and mesh display, no missing faces

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 5a9a8b832ac3190eb0b522edad9226a4fb82b158444dd3f8ffba37a1fca3b882 | 5a9a8b832ac3190eb0b522edad9226a4fb82b158444dd3f8ffba37a1fca3b882 | aab732539bae71fe613d4c53c6060168fb58e0233b062806ae4b3309ec96fe1c | aab732539bae71fe613d4c53c6060168fb58e0233b062806ae4b3309ec96fe1c | no |

## 781b83fc023c2ace7c9e92084665788eac360ff93ae3ce9e823ec420ae356a29

Message: Speed up exact STEP import without reducing validation: lazy diagnostics, exact point reuse and detailed phase timings

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | aab732539bae71fe613d4c53c6060168fb58e0233b062806ae4b3309ec96fe1c | aab732539bae71fe613d4c53c6060168fb58e0233b062806ae4b3309ec96fe1c | ca54fffcb7cfb6e7f86616829239ed67ba19c9d63d99c6641820a7a0602a5cda | ca54fffcb7cfb6e7f86616829239ed67ba19c9d63d99c6641820a7a0602a5cda | no |
| public/nodec/NodeC.js | 91bff929492dc23072b16e54dd469c0ecbf49f744fde2a1b35269bd40c290918 | 91bff929492dc23072b16e54dd469c0ecbf49f744fde2a1b35269bd40c290918 | 035fbb55486719f4567eb3184b173d50815314df6d1c7d20605dc7720ecb9675 | 035fbb55486719f4567eb3184b173d50815314df6d1c7d20605dc7720ecb9675 | no |
| public/nodec/NodeC.wasm | 30df1e5118dd4c1f3018b9d69fe9c29fdcbc65a6c36ec007cd3847ade2c49fdd | 30df1e5118dd4c1f3018b9d69fe9c29fdcbc65a6c36ec007cd3847ade2c49fdd | 82a0923745e72f5e7deb136a0fe560cc148385d2b9902ab77e83b317f0c5d838 | 82a0923745e72f5e7deb136a0fe560cc148385d2b9902ab77e83b317f0c5d838 | no |
| scripts/test-step-opennurbs.cjs | 10e21322083c4fb36105e354699c0ec6d25bb568964baa46b3bc052dcb865c3e | 10e21322083c4fb36105e354699c0ec6d25bb568964baa46b3bc052dcb865c3e | bb1ece50443eb14aab95810c39748c2f2b7fd2356644d4f73923bb64f70cb96d | bb1ece50443eb14aab95810c39748c2f2b7fd2356644d4f73923bb64f70cb96d | no |
| scripts/test-step-progressive-browser.cjs | 0059e2131e32955745251576bba18762fe67b5b57cce3e899407a345d6fd478e | 0059e2131e32955745251576bba18762fe67b5b57cce3e899407a345d6fd478e | 51f4491bd3e694f96e4c531b7932be2fc6154fe8726cb802e52e71522ed70766 | 51f4491bd3e694f96e4c531b7932be2fc6154fe8726cb802e52e71522ed70766 | no |
| src/import/StepOpenNurbsImport.js | acd16258c267a6ec30d1581f46a4c373d00ad915cbbff0b62846b90842f623cc | acd16258c267a6ec30d1581f46a4c373d00ad915cbbff0b62846b90842f623cc | 9318b42cb7b9085768237395b94aab034b9e105fa5164143b039cfde2f54157e | 9318b42cb7b9085768237395b94aab034b9e105fa5164143b039cfde2f54157e | no |

## be1f9f1883bc2c6e6b72acc511776798f9c3249f1563a047a8aafbf867bd8fad

Message: Record optimized STEP browser results: 321 seconds, 70 complete native objects

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | ca54fffcb7cfb6e7f86616829239ed67ba19c9d63d99c6641820a7a0602a5cda | ca54fffcb7cfb6e7f86616829239ed67ba19c9d63d99c6641820a7a0602a5cda | f6e8853603c70ba887e508a5ff5aef6e13c20bed4050611f7d52a68f794122e9 | f6e8853603c70ba887e508a5ff5aef6e13c20bed4050611f7d52a68f794122e9 | no |

## e8a66e23504b1d41603182e370ac20d8b4e9a52b7625c8092b94ab08c22e4bbf

Message: Profile STEP solver phases and reduce exact duplicate validation; optimize numerical WASM code

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | f6e8853603c70ba887e508a5ff5aef6e13c20bed4050611f7d52a68f794122e9 | f6e8853603c70ba887e508a5ff5aef6e13c20bed4050611f7d52a68f794122e9 | 89f4dfdf4188a5e15727deec30f0c3c01e2e1c14b356b1981ff648a65241a321 | 89f4dfdf4188a5e15727deec30f0c3c01e2e1c14b356b1981ff648a65241a321 | no |
| public/nodec/NodeC.js | 035fbb55486719f4567eb3184b173d50815314df6d1c7d20605dc7720ecb9675 | 035fbb55486719f4567eb3184b173d50815314df6d1c7d20605dc7720ecb9675 | 6300b393c00720467fc2be20926f70f6828502787a11b10f99e5e54002a09e0e | 6300b393c00720467fc2be20926f70f6828502787a11b10f99e5e54002a09e0e | no |
| public/nodec/NodeC.wasm | 82a0923745e72f5e7deb136a0fe560cc148385d2b9902ab77e83b317f0c5d838 | 82a0923745e72f5e7deb136a0fe560cc148385d2b9902ab77e83b317f0c5d838 | 1330d9d63f194d2a7807b9918eabd72a08841c56d2713dda10fefb4701d6e3d5 | 1330d9d63f194d2a7807b9918eabd72a08841c56d2713dda10fefb4701d6e3d5 | no |
| scripts/test-step-opennurbs.cjs | bb1ece50443eb14aab95810c39748c2f2b7fd2356644d4f73923bb64f70cb96d | bb1ece50443eb14aab95810c39748c2f2b7fd2356644d4f73923bb64f70cb96d | 692c27750394c4b315d6f074b30361aac2be67caf47577bbfea5c88563ed8f0f | 692c27750394c4b315d6f074b30361aac2be67caf47577bbfea5c88563ed8f0f | no |
| scripts/test-step-progressive-browser.cjs | 51f4491bd3e694f96e4c531b7932be2fc6154fe8726cb802e52e71522ed70766 | 51f4491bd3e694f96e4c531b7932be2fc6154fe8726cb802e52e71522ed70766 | 8e3d8293bea53e21c6de5d2bcbcbe4e78d60c17768b683c7da61580d6ac7fa7c | 8e3d8293bea53e21c6de5d2bcbcbe4e78d60c17768b683c7da61580d6ac7fa7c | no |

## 168bf6c6d0cda5de273b88a60256870f3e0ddf01dfffc0f6594bb3dd24c134e6

Message: Record full STEP browser profile: 268 seconds and late mesh-job bottleneck

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 89f4dfdf4188a5e15727deec30f0c3c01e2e1c14b356b1981ff648a65241a321 | 89f4dfdf4188a5e15727deec30f0c3c01e2e1c14b356b1981ff648a65241a321 | a7e379954a7b06250d76293f304fc87f7f2bb1bd754d96baa5d120015d1cf348 | a7e379954a7b06250d76293f304fc87f7f2bb1bd754d96baa5d120015d1cf348 | no |

## d991521d68a2217cb79d083a495b8e5968ffaf93b92095f6f36a518b15da68c9

Message: Improve STEP projection convergence, conditioning, pole branches and trim refinement; retain fitting budgets

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | a7e379954a7b06250d76293f304fc87f7f2bb1bd754d96baa5d120015d1cf348 | a7e379954a7b06250d76293f304fc87f7f2bb1bd754d96baa5d120015d1cf348 | 035ec5b8264e346488539fcec9d8f1b5a27d65cf6cfa01891b12a50a819e037d | 035ec5b8264e346488539fcec9d8f1b5a27d65cf6cfa01891b12a50a819e037d | no |
| public/nodec/NodeC.js | 6300b393c00720467fc2be20926f70f6828502787a11b10f99e5e54002a09e0e | 6300b393c00720467fc2be20926f70f6828502787a11b10f99e5e54002a09e0e | 51ac8100f9df30d96c5fd5efd088959d1cc8a459d43e7ce961136b8c56fcaa79 | 51ac8100f9df30d96c5fd5efd088959d1cc8a459d43e7ce961136b8c56fcaa79 | no |
| public/nodec/NodeC.wasm | 1330d9d63f194d2a7807b9918eabd72a08841c56d2713dda10fefb4701d6e3d5 | 1330d9d63f194d2a7807b9918eabd72a08841c56d2713dda10fefb4701d6e3d5 | 01cc8208f2294a05153e5c094e9709c15b79e6a10f50d43dc082379ebffa7a3e | 01cc8208f2294a05153e5c094e9709c15b79e6a10f50d43dc082379ebffa7a3e | no |
| scripts/test-step-brep.cjs | 8c062116252aa5d59ce0e87b4378443c411c0d9199226b770d795e2e6d979602 | 8c062116252aa5d59ce0e87b4378443c411c0d9199226b770d795e2e6d979602 | 4fe2a41baa9b194fc539ac8ff6a6fba49616d3732940ab9201e2f26d1276a592 | 4fe2a41baa9b194fc539ac8ff6a6fba49616d3732940ab9201e2f26d1276a592 | no |
| scripts/test-step-opennurbs.cjs | 692c27750394c4b315d6f074b30361aac2be67caf47577bbfea5c88563ed8f0f | 692c27750394c4b315d6f074b30361aac2be67caf47577bbfea5c88563ed8f0f | 5d1865f9dca26ebcf008e1b96284c70d99398ff43946da78871800fa3a286ea3 | 5d1865f9dca26ebcf008e1b96284c70d99398ff43946da78871800fa3a286ea3 | no |

## 0ce9d57793d43ff12c7bea99053ccdc9541930583f4f3c1ed0a6a9f5edb99b82

Message: Preserve thin STEP display faces with targeted local-origin recovery; validate complete display coverage and object budgets

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/nodec/NodeC.js | 51ac8100f9df30d96c5fd5efd088959d1cc8a459d43e7ce961136b8c56fcaa79 | 51ac8100f9df30d96c5fd5efd088959d1cc8a459d43e7ce961136b8c56fcaa79 | 0906b81bee9e4dade2c8e5b6f4c65b790bf652e5837ab69ad274d837b5b9b73a | 0906b81bee9e4dade2c8e5b6f4c65b790bf652e5837ab69ad274d837b5b9b73a | no |
| public/nodec/NodeC.wasm | 01cc8208f2294a05153e5c094e9709c15b79e6a10f50d43dc082379ebffa7a3e | 01cc8208f2294a05153e5c094e9709c15b79e6a10f50d43dc082379ebffa7a3e | b276a42b6896df3e3bf1cd745be64432be39e6c3b93afc2b627b4f09703dee81 | b276a42b6896df3e3bf1cd745be64432be39e6c3b93afc2b627b4f09703dee81 | no |
| scripts/test-step-brep.cjs | 4fe2a41baa9b194fc539ac8ff6a6fba49616d3732940ab9201e2f26d1276a592 | 4fe2a41baa9b194fc539ac8ff6a6fba49616d3732940ab9201e2f26d1276a592 | 25db270258c45690ea410cf6c9b49dbb97ba478d38304ccbd0221f567f105736 | 25db270258c45690ea410cf6c9b49dbb97ba478d38304ccbd0221f567f105736 | no |
| scripts/test-step-progressive-browser.cjs | 8e3d8293bea53e21c6de5d2bcbcbe4e78d60c17768b683c7da61580d6ac7fa7c | 8e3d8293bea53e21c6de5d2bcbcbe4e78d60c17768b683c7da61580d6ac7fa7c | 4cb17ca7ef7cd6514660357d993d338292f062ad3906dac2bd3b5d65693898e9 | 4cb17ca7ef7cd6514660357d993d338292f062ad3906dac2bd3b5d65693898e9 | no |

## e50b6357a008400a3ded542b683f3d882dfb15e9a612a2758f73c5bfe1e32e3e

Message: Record verified STEP projection gains and complete browser display: 70 objects, 8830 faces, no missing meshes; both production builds and geometry regressions pass

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 035ec5b8264e346488539fcec9d8f1b5a27d65cf6cfa01891b12a50a819e037d | 035ec5b8264e346488539fcec9d8f1b5a27d65cf6cfa01891b12a50a819e037d | 0d02449320399ad55316edb03a81d925b3a1d2763f635c3f86a3a6b3110cbe0b | 0d02449320399ad55316edb03a81d925b3a1d2763f635c3f86a3a6b3110cbe0b | no |

## a63c7a4c74b34498089c9972574fd5b47c3a1c3a714c1d2baf23a94cea058f47

Message: Stream STEP assembly instances before geometry, reuse definitions and bound reader memory; native, hierarchy, browser and cancellation regressions pass

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/FRONTEND_SYNC.md | c3880ccccc448d28ae6cadd6f61ccbdcbe013a87eee530b42a3cd967964fccb9 | c3880ccccc448d28ae6cadd6f61ccbdcbe013a87eee530b42a3cd967964fccb9 | 410691a566d2d8f68ac4495437ab8634d68a15eb52a3113e824c552436a9a170 | 410691a566d2d8f68ac4495437ab8634d68a15eb52a3113e824c552436a9a170 | no |
| docs/STEP_IMPORT.md | 0d02449320399ad55316edb03a81d925b3a1d2763f635c3f86a3a6b3110cbe0b | 0d02449320399ad55316edb03a81d925b3a1d2763f635c3f86a3a6b3110cbe0b | 4179a590a5f5611fa19c3086a823dbf4a7b2e6073e19945485db376df87c06b5 | 4179a590a5f5611fa19c3086a823dbf4a7b2e6073e19945485db376df87c06b5 | no |
| scripts/sync-frontend-export.cjs | 6da44147bf425896e8752f24ebb93b31e9bf57ae3071d8dfe655b553bd83f337 | 6da44147bf425896e8752f24ebb93b31e9bf57ae3071d8dfe655b553bd83f337 | 318aabbe79af8d0003620ab21f6d051b8b52029c08d6537856ee0d7e85f28b7c | 318aabbe79af8d0003620ab21f6d051b8b52029c08d6537856ee0d7e85f28b7c | no |
| scripts/test-step-instances.cjs | absent | absent | 0651b8aa9405bff13c0d3c6a57d09b01d47e7d02207e53af66831cc10e9b761f | 0651b8aa9405bff13c0d3c6a57d09b01d47e7d02207e53af66831cc10e9b761f | no |
| scripts/test-step-opennurbs.cjs | 5d1865f9dca26ebcf008e1b96284c70d99398ff43946da78871800fa3a286ea3 | 5d1865f9dca26ebcf008e1b96284c70d99398ff43946da78871800fa3a286ea3 | 0bcc6500ca48332276e75839316545e90e8d435b8854dc72da96ab9b8cab76e3 | 0bcc6500ca48332276e75839316545e90e8d435b8854dc72da96ab9b8cab76e3 | no |
| scripts/test-step-part21.cjs | b47a8cd92d4e681cd28ddf2b680b4bf65106f8caf4744c2258d041636eb19f1d | b47a8cd92d4e681cd28ddf2b680b4bf65106f8caf4744c2258d041636eb19f1d | 37a5329c55ed78d0f608ec9706ab35fe935995e24b62c0eb0a4d8aca70e8563e | 37a5329c55ed78d0f608ec9706ab35fe935995e24b62c0eb0a4d8aca70e8563e | no |
| scripts/test-step-progressive-browser.cjs | 4cb17ca7ef7cd6514660357d993d338292f062ad3906dac2bd3b5d65693898e9 | 4cb17ca7ef7cd6514660357d993d338292f062ad3906dac2bd3b5d65693898e9 | 69e8783b3c655c954b104fc6062552c65ea5c818520d7e8121dd1d6ca700a732 | 69e8783b3c655c954b104fc6062552c65ea5c818520d7e8121dd1d6ca700a732 | no |
| src/PandaUIApp.js | 20eb11bda5db10fa679615ce26e2e127e69ed8347ba3354e78d1af7c0d681a36 | 20eb11bda5db10fa679615ce26e2e127e69ed8347ba3354e78d1af7c0d681a36 | 61b0ace582d5120f657017e93f8a4f0e1c044834da85acd82c92ccbeaf869385 | 61b0ace582d5120f657017e93f8a4f0e1c044834da85acd82c92ccbeaf869385 | no |
| src/PandaUIDoc.js | b4d435156d3455cae08e0880560c32f8857dd0154612ebffb041971420e2c75c | b4d435156d3455cae08e0880560c32f8857dd0154612ebffb041971420e2c75c | fcc073ffae41f26dbd75e1da109309b68a3a259c4d8ebbcfbfda91bf6ef6690e | fcc073ffae41f26dbd75e1da109309b68a3a259c4d8ebbcfbfda91bf6ef6690e | no |
| src/import/ProgressiveStepImport.js | 6f1f84f4f90fed882e69145008ed518afd3d795c31ca9c6f836798a1c3a1ae8e | 6f1f84f4f90fed882e69145008ed518afd3d795c31ca9c6f836798a1c3a1ae8e | 47a951c4705f2750e43bb1b3e44d1135dded7e1dcccffd091b2d2561c0b8dc09 | 47a951c4705f2750e43bb1b3e44d1135dded7e1dcccffd091b2d2561c0b8dc09 | no |
| src/import/StepNativeImport.js | 926986bf19dd4ec2d404665fe8d543ca60094571907330c22da3da0361d72398 | 926986bf19dd4ec2d404665fe8d543ca60094571907330c22da3da0361d72398 | 7408a95c4052416158387118064b055c8390556911d7d4d27932c96e85171299 | 7408a95c4052416158387118064b055c8390556911d7d4d27932c96e85171299 | no |
| src/import/StepOpenNurbsImport.js | 9318b42cb7b9085768237395b94aab034b9e105fa5164143b039cfde2f54157e | 9318b42cb7b9085768237395b94aab034b9e105fa5164143b039cfde2f54157e | b7af857c782055d8ca5110bec1ac08ea92d1a5683007860e7791cf888c9eb0e2 | b7af857c782055d8ca5110bec1ac08ea92d1a5683007860e7791cf888c9eb0e2 | no |
| src/import/StepPart21.js | daf31f4ff72d205d4f1e815ae428c6c774d4fca600e86b70e9377986d05d99ab | daf31f4ff72d205d4f1e815ae428c6c774d4fca600e86b70e9377986d05d99ab | c9f618dfacb6a88194a4380a2ea7878b428a8d01969d508f199c8de5c6e09cef | c9f618dfacb6a88194a4380a2ea7878b428a8d01969d508f199c8de5c6e09cef | no |
| src/import/StreamingStepInstances.js | absent | absent | 1d583a34681ac5a8b93a14f06e0c58599e3e0db7f3939f438e87cfbddaced098 | 1d583a34681ac5a8b93a14f06e0c58599e3e0db7f3939f438e87cfbddaced098 | no |

## 97073450e14079e0005d0dd7e9d3a416dbaa527727ad6dd071add71be7fba3b1

Message: Optimize STEP shared metadata, sphere conversion and simple surface validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 4179a590a5f5611fa19c3086a823dbf4a7b2e6073e19945485db376df87c06b5 | 4179a590a5f5611fa19c3086a823dbf4a7b2e6073e19945485db376df87c06b5 | 9acc827093233e94a3d923497215d841168c27ca6fac4d9b288aadde1f39e99c | 9acc827093233e94a3d923497215d841168c27ca6fac4d9b288aadde1f39e99c | no |
| public/nodec/NodeC.js | 0906b81bee9e4dade2c8e5b6f4c65b790bf652e5837ab69ad274d837b5b9b73a | 0906b81bee9e4dade2c8e5b6f4c65b790bf652e5837ab69ad274d837b5b9b73a | 5eb256486fba03999d808949a4aafc23bcc18ee8648cf1fbc7a80385ba81bdcb | 5eb256486fba03999d808949a4aafc23bcc18ee8648cf1fbc7a80385ba81bdcb | no |
| public/nodec/NodeC.wasm | b276a42b6896df3e3bf1cd745be64432be39e6c3b93afc2b627b4f09703dee81 | b276a42b6896df3e3bf1cd745be64432be39e6c3b93afc2b627b4f09703dee81 | b079482d1d2c13a5f3f2e56829297839997089d3b6f29475a1c52ee3ca9bb88c | b079482d1d2c13a5f3f2e56829297839997089d3b6f29475a1c52ee3ca9bb88c | no |
| src/import/ProgressiveStepImport.js | 47a951c4705f2750e43bb1b3e44d1135dded7e1dcccffd091b2d2561c0b8dc09 | 47a951c4705f2750e43bb1b3e44d1135dded7e1dcccffd091b2d2561c0b8dc09 | 976e0ea16bbe840179b7b00df15df61e020f473ea0e8fcbae9679dd06791b54d | 976e0ea16bbe840179b7b00df15df61e020f473ea0e8fcbae9679dd06791b54d | no |
| src/import/StepBrep.js | e8b1a173994ae8f5b3c334ee321b0568a8e5a7c592d39f8c0c31bea761f8048d | e8b1a173994ae8f5b3c334ee321b0568a8e5a7c592d39f8c0c31bea761f8048d | 2086dff736d2be3cb30119af88810ed2b89d13200e68131a644af672e8790338 | 2086dff736d2be3cb30119af88810ed2b89d13200e68131a644af672e8790338 | no |
| src/import/StepOpenNurbsImport.js | b7af857c782055d8ca5110bec1ac08ea92d1a5683007860e7791cf888c9eb0e2 | b7af857c782055d8ca5110bec1ac08ea92d1a5683007860e7791cf888c9eb0e2 | 6284d0f5eb422ac9e1398101798e217912a64e7c0040022bafa010a104d75b39 | 6284d0f5eb422ac9e1398101798e217912a64e7c0040022bafa010a104d75b39 | no |
| src/import/StepPart21.js | c9f618dfacb6a88194a4380a2ea7878b428a8d01969d508f199c8de5c6e09cef | c9f618dfacb6a88194a4380a2ea7878b428a8d01969d508f199c8de5c6e09cef | 8910fcddfe6bbb6816e37a779ab95b5d741c73c266039d717cf219ff1a863551 | 8910fcddfe6bbb6816e37a779ab95b5d741c73c266039d717cf219ff1a863551 | no |

## 58a6fa8d60c73db943141ef42c87b4f2dbc08d4d33cd1d1b8498d16ab966f326

Message: Document STEP shared metadata optimization validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 9acc827093233e94a3d923497215d841168c27ca6fac4d9b288aadde1f39e99c | 9acc827093233e94a3d923497215d841168c27ca6fac4d9b288aadde1f39e99c | 6cccaef6ba45e8dfa1254e56c96f3ff6c5d2207c9ac785f2450f7e00f0b813fd | 6cccaef6ba45e8dfa1254e56c96f3ff6c5d2207c9ac785f2450f7e00f0b813fd | no |

## bcb25ca498f6bb9ddc8b7b90dc2d22f5bcdf0b14f01ab010ef57ba1c63585b4a

Message: Restore STEP auxiliary point-set objects

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 6cccaef6ba45e8dfa1254e56c96f3ff6c5d2207c9ac785f2450f7e00f0b813fd | 6cccaef6ba45e8dfa1254e56c96f3ff6c5d2207c9ac785f2450f7e00f0b813fd | 687f42e34c757dbd8e4f312e71df620043191f121977ecbc5d6cd59934510598 | 687f42e34c757dbd8e4f312e71df620043191f121977ecbc5d6cd59934510598 | no |
| scripts/test-step-opennurbs.cjs | 0bcc6500ca48332276e75839316545e90e8d435b8854dc72da96ab9b8cab76e3 | 0bcc6500ca48332276e75839316545e90e8d435b8854dc72da96ab9b8cab76e3 | f93ed06d2249b48b3152d11a82178210f9816eddb75aa7ba0d3a1cae6e491114 | f93ed06d2249b48b3152d11a82178210f9816eddb75aa7ba0d3a1cae6e491114 | no |
| src/import/StepNativeImport.js | 7408a95c4052416158387118064b055c8390556911d7d4d27932c96e85171299 | 7408a95c4052416158387118064b055c8390556911d7d4d27932c96e85171299 | b4e0545c8009754073f3a993c574ce44df029dc5fe8f58bc16c7640077e8821b | b4e0545c8009754073f3a993c574ce44df029dc5fe8f58bc16c7640077e8821b | no |
| src/import/StepOpenNurbsImport.js | 6284d0f5eb422ac9e1398101798e217912a64e7c0040022bafa010a104d75b39 | 6284d0f5eb422ac9e1398101798e217912a64e7c0040022bafa010a104d75b39 | 5874dbd1018603d84f14dbd57550d143f4e5e22469ffc276c95d715051783332 | 5874dbd1018603d84f14dbd57550d143f4e5e22469ffc276c95d715051783332 | no |

## 83dca0bb25901b85347ce8b4ee9532c597b23e99d7c44128baea56f081f552ac

Message: Clarify STEP auxiliary point display records

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 687f42e34c757dbd8e4f312e71df620043191f121977ecbc5d6cd59934510598 | 687f42e34c757dbd8e4f312e71df620043191f121977ecbc5d6cd59934510598 | 036a1950b7b767274302bd0a25afb318a3e6d748c85ffed2c258ee5e43d6755b | 036a1950b7b767274302bd0a25afb318a3e6d748c85ffed2c258ee5e43d6755b | no |

## 7a0fc0182bad51f00ff38d9e58ca1b8a1c6917fbf770f92d01b2d31149fdd204

Message: Prevent STEP auxiliary display records from entering the mesh feed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/PandaUIApp.js | 61b0ace582d5120f657017e93f8a4f0e1c044834da85acd82c92ccbeaf869385 | 61b0ace582d5120f657017e93f8a4f0e1c044834da85acd82c92ccbeaf869385 | 043d71aaa9553e741bfe89235c910be1581a62621fe94a885525c76d4ecf2a65 | 043d71aaa9553e741bfe89235c910be1581a62621fe94a885525c76d4ecf2a65 | no |
| src/import/ImportMeshFeed.js | 5dcd97930a65c3c6f02c1722d2da1e2da6f7acba085c8979a65cef8e44dfcf6f | 5dcd97930a65c3c6f02c1722d2da1e2da6f7acba085c8979a65cef8e44dfcf6f | 1faf2a0e2dfae8b1df64af6f56ea8a8a520d966c79910d647fe50cba29d71e03 | 1faf2a0e2dfae8b1df64af6f56ea8a8a520d966c79910d647fe50cba29d71e03 | no |

## da5918093366078f6e65a34ad248127666bca1edb156d7c3ea20078dde40ef66

Message: Canonicalize rotational STEP trim joins before OpenNURBS validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/StepRevolvedTrim.js | 0386b5474ea3d919cced970c5fab0259e4a67b499585f8b94fdc575b33160f49 | 0386b5474ea3d919cced970c5fab0259e4a67b499585f8b94fdc575b33160f49 | 34647fbed82af8935c8ac345c77707e40e4c0e381e3d2810e63f999abb6453b2 | 34647fbed82af8935c8ac345c77707e40e4c0e381e3d2810e63f999abb6453b2 | no |

## 9a8cb5d3622c6e99801dec0995b81f6b2e55d7c76bc6d1888803c713e5e1bf7d

Message: Fix Body-L01 STEP shell recovery and mesh queue guards

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/MeshWorkerPool.js | 0413f3244d90873d25f2a60b304a658560b8b228a3492f0c9113b4f9acaa894c | 0413f3244d90873d25f2a60b304a658560b8b228a3492f0c9113b4f9acaa894c | 8a0b9f46c96a2131d021f65d08eb8412d52ea23097b82a6b9e9336daa82eda10 | 8a0b9f46c96a2131d021f65d08eb8412d52ea23097b82a6b9e9336daa82eda10 | no |
| src/import/ProgressiveStepImport.js | 976e0ea16bbe840179b7b00df15df61e020f473ea0e8fcbae9679dd06791b54d | 976e0ea16bbe840179b7b00df15df61e020f473ea0e8fcbae9679dd06791b54d | d9a14bbb0de1d54f01a837dced3313cceac49b970f04381a0d9617e4fec26bbe | d9a14bbb0de1d54f01a837dced3313cceac49b970f04381a0d9617e4fec26bbe | no |
| src/import/StepBrep.js | 2086dff736d2be3cb30119af88810ed2b89d13200e68131a644af672e8790338 | 2086dff736d2be3cb30119af88810ed2b89d13200e68131a644af672e8790338 | b07d52f75822d3f46e5807c2154cf75d493e11e02a2c3cd5ccb6c768f15825ad | b07d52f75822d3f46e5807c2154cf75d493e11e02a2c3cd5ccb6c768f15825ad | no |
| src/import/StepGeometry.js | 4168e5d4720d0be19276b7a3ccea9b636746e72635015c80d3c4929e0dbee04e | 4168e5d4720d0be19276b7a3ccea9b636746e72635015c80d3c4929e0dbee04e | ed0f37949be1f7eaf39d94f532b97f909cd0448a8157155fdb9bd9ad3ee2b13c | ed0f37949be1f7eaf39d94f532b97f909cd0448a8157155fdb9bd9ad3ee2b13c | no |
| src/import/StepOpenNurbsImport.js | 5874dbd1018603d84f14dbd57550d143f4e5e22469ffc276c95d715051783332 | 5874dbd1018603d84f14dbd57550d143f4e5e22469ffc276c95d715051783332 | 21b7f6b65e4034f87e12ffdc63b7db8a42e60c9b7061d4beb511330b0726c9a1 | 21b7f6b65e4034f87e12ffdc63b7db8a42e60c9b7061d4beb511330b0726c9a1 | no |
| src/import/StepRevolvedTrim.js | 34647fbed82af8935c8ac345c77707e40e4c0e381e3d2810e63f999abb6453b2 | 34647fbed82af8935c8ac345c77707e40e4c0e381e3d2810e63f999abb6453b2 | 9d4e41881f88d094dce4233dc88933509231f507c80c7fd8124cedb603e81e46 | 9d4e41881f88d094dce4233dc88933509231f507c80c7fd8124cedb603e81e46 | no |

## ec7044637707f0f97c121c7cd51304bb265571149925ac0d78b68f32c56c7c1c

Message: Report recovered open STEP shells

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/ProgressiveStepImport.js | d9a14bbb0de1d54f01a837dced3313cceac49b970f04381a0d9617e4fec26bbe | d9a14bbb0de1d54f01a837dced3313cceac49b970f04381a0d9617e4fec26bbe | f0e9dc0ba6ac8b23a12de6a170dd285ed2c1f37d831f866d2c4e4460865341fe | f0e9dc0ba6ac8b23a12de6a170dd285ed2c1f37d831f866d2c4e4460865341fe | no |

## 301b52830bdce560ae36305528b493f4676b0fb4ca1d1930ac5614e58be4b470

Message: Add browser SKP import; verify native visibility, holes, transforms, angle-weighted normals and display modes

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/SKP_IMPORT.md | absent | absent | 4048ac6b5d4f485d13e70447e1e0338d248c6384c2d1112c712213f857a593f0 | 4048ac6b5d4f485d13e70447e1e0338d248c6384c2d1112c712213f857a593f0 | no |
| public/shared/skp/NOTICES.txt | absent | absent | 864c9a19bbcfa396a698a2734b56a4f58e5452dded201bde31db938b95da18c6 | 864c9a19bbcfa396a698a2734b56a4f58e5452dded201bde31db938b95da18c6 | no |
| public/shared/skp/PandaSkp.js | absent | absent | 3ebc985e3fa2430565d6b1ca5cb6a0827df6fd5a444d9afb1d405959b49cf705 | 3ebc985e3fa2430565d6b1ca5cb6a0827df6fd5a444d9afb1d405959b49cf705 | no |
| scripts/build-skp-runtime.cjs | absent | absent | 504d2a1dc42304695354bbaa47662e7f315c0afd541c08e99cf4d19c5a8afbeb | 504d2a1dc42304695354bbaa47662e7f315c0afd541c08e99cf4d19c5a8afbeb | no |
| scripts/sync-frontend-export.cjs | 318aabbe79af8d0003620ab21f6d051b8b52029c08d6537856ee0d7e85f28b7c | 318aabbe79af8d0003620ab21f6d051b8b52029c08d6537856ee0d7e85f28b7c | 8ef1ba4c6dfd023fd7b4734ee2165e0dc530671fe3c30f2bc125b2b8131a4489 | 8ef1ba4c6dfd023fd7b4734ee2165e0dc530671fe3c30f2bc125b2b8131a4489 | no |
| scripts/test-skp-browser.cjs | absent | absent | b640f189e63f879b6dfab1753fae462753a85d1c8938f9a96a780d6570dbb90e | b640f189e63f879b6dfab1753fae462753a85d1c8938f9a96a780d6570dbb90e | no |
| scripts/test-skp-import.cjs | absent | absent | dbeeea7078c39107f6afd4472a54216c1d982149a124820eaf8a91d2155d595c | dbeeea7078c39107f6afd4472a54216c1d982149a124820eaf8a91d2155d595c | no |
| src/PandaUIDoc.js | fcc073ffae41f26dbd75e1da109309b68a3a259c4d8ebbcfbfda91bf6ef6690e | fcc073ffae41f26dbd75e1da109309b68a3a259c4d8ebbcfbfda91bf6ef6690e | 19c9f8c53a1a9b437bd0a81ee936c4fdc62f5de2c837beadc95cf47b626d4fbc | 19c9f8c53a1a9b437bd0a81ee936c4fdc62f5de2c837beadc95cf47b626d4fbc | no |
| src/import/DisplayObjectImport.js | c059c31cac41b20403233d6a26b64f2a70a7474f30832a03369a5fbc98047b40 | c059c31cac41b20403233d6a26b64f2a70a7474f30832a03369a5fbc98047b40 | f970be865954e2ecf6544fa8d52d54df451cf3a5fb904f31abca86a2dfc9ad5c | f970be865954e2ecf6544fa8d52d54df451cf3a5fb904f31abca86a2dfc9ad5c | no |
| src/import/LocalImport.worker.js | cedf150821f26d022aabbda8aa807af606c64ab04c8d6b458d9eed7358e72ed9 | cedf150821f26d022aabbda8aa807af606c64ab04c8d6b458d9eed7358e72ed9 | 03c689b02930e6d01ce56fa78d1a99c5424b56b47e4e7f54cccfe17c79c5edf8 | 03c689b02930e6d01ce56fa78d1a99c5424b56b47e4e7f54cccfe17c79c5edf8 | no |
| src/import/ModelFileFormats.js | 4dd6ea52d29aba847d187db47c19daef2443ab6554284968586264f16a8ad668 | 4dd6ea52d29aba847d187db47c19daef2443ab6554284968586264f16a8ad668 | 2a16ac62b9840d5d8729c21534943a73e804f8e32187d19b2b6eb4b5ff0698cb | 2a16ac62b9840d5d8729c21534943a73e804f8e32187d19b2b6eb4b5ff0698cb | no |
| src/import/SketchUpImport.js | absent | absent | ec309cdb9a19a37c6af0973f3a54ab957eb43fd3d085bb533770bb3de7ece156 | ec309cdb9a19a37c6af0973f3a54ab957eb43fd3d085bb533770bb3de7ece156 | no |

## d90ccd30374f8fd0bac99bb3fbf3c4b7bd9a6238284e4a3e1e9d75b31338fb75

Message: Record final SKP SDK comparison, browser validation and version coverage

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/SKP_IMPORT.md | 4048ac6b5d4f485d13e70447e1e0338d248c6384c2d1112c712213f857a593f0 | 4048ac6b5d4f485d13e70447e1e0338d248c6384c2d1112c712213f857a593f0 | 8508e881d2d065e0e9aa5e005782eef0ebb97c3d82070654d74bdc2cd981084a | 8508e881d2d065e0e9aa5e005782eef0ebb97c3d82070654d74bdc2cd981084a | no |

## 2e54d76a9c56f99f1f143b93a3c3f02adf5f38f0af374f146ad8553b9fdac01e

Message: Progressive SKP instances and editable shared materials: edge-first batches, inherited textures, live edits; SKP, display and material regressions passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/SKP_IMPORT.md | 8508e881d2d065e0e9aa5e005782eef0ebb97c3d82070654d74bdc2cd981084a | 8508e881d2d065e0e9aa5e005782eef0ebb97c3d82070654d74bdc2cd981084a | d8fcfb4a1535ab1ed5556a27f4408090f46505bb895b3a844d22ff7db02372cc | d8fcfb4a1535ab1ed5556a27f4408090f46505bb895b3a844d22ff7db02372cc | no |
| public/shared/skp/PandaSkp.js | 3ebc985e3fa2430565d6b1ca5cb6a0827df6fd5a444d9afb1d405959b49cf705 | 3ebc985e3fa2430565d6b1ca5cb6a0827df6fd5a444d9afb1d405959b49cf705 | 2a8a2e64620821561561972c1b19583aea6cc9136da956e4c50f7b1b1c5b1e07 | 2a8a2e64620821561561972c1b19583aea6cc9136da956e4c50f7b1b1c5b1e07 | no |
| scripts/build-skp-runtime.cjs | 504d2a1dc42304695354bbaa47662e7f315c0afd541c08e99cf4d19c5a8afbeb | 504d2a1dc42304695354bbaa47662e7f315c0afd541c08e99cf4d19c5a8afbeb | 300fab35b2ea10d5ea09836d381e1fcdaa91708227bba048166da82ffb752053 | 300fab35b2ea10d5ea09836d381e1fcdaa91708227bba048166da82ffb752053 | no |
| scripts/test-skp-browser.cjs | b640f189e63f879b6dfab1753fae462753a85d1c8938f9a96a780d6570dbb90e | b640f189e63f879b6dfab1753fae462753a85d1c8938f9a96a780d6570dbb90e | 1b9d8e9e69fdb8cc31d6230da660fbf8b52b50cf7e4d0d0cf8020210eb1a154c | 1b9d8e9e69fdb8cc31d6230da660fbf8b52b50cf7e4d0d0cf8020210eb1a154c | no |
| scripts/test-skp-import.cjs | dbeeea7078c39107f6afd4472a54216c1d982149a124820eaf8a91d2155d595c | dbeeea7078c39107f6afd4472a54216c1d982149a124820eaf8a91d2155d595c | 30c788b39a351ee13f875d8f2454a15303e7132d3941520310173a2d6ee37d2c | 30c788b39a351ee13f875d8f2454a15303e7132d3941520310173a2d6ee37d2c | no |
| src/PandaUIApp.js | 043d71aaa9553e741bfe89235c910be1581a62621fe94a885525c76d4ecf2a65 | 043d71aaa9553e741bfe89235c910be1581a62621fe94a885525c76d4ecf2a65 | be2bd4ddf1fa26b03af29242e1d6b9301dfb3dc27ce275a191030c71d12cffce | be2bd4ddf1fa26b03af29242e1d6b9301dfb3dc27ce275a191030c71d12cffce | no |
| src/PandaUIDoc.js | 19c9f8c53a1a9b437bd0a81ee936c4fdc62f5de2c837beadc95cf47b626d4fbc | 19c9f8c53a1a9b437bd0a81ee936c4fdc62f5de2c837beadc95cf47b626d4fbc | f3fc0b54ef227d71a0792c376775653990172b46841950c433ad61821b74e121 | f3fc0b54ef227d71a0792c376775653990172b46841950c433ad61821b74e121 | no |
| src/import/DisplayObjectImport.js | f970be865954e2ecf6544fa8d52d54df451cf3a5fb904f31abca86a2dfc9ad5c | f970be865954e2ecf6544fa8d52d54df451cf3a5fb904f31abca86a2dfc9ad5c | d812f1cde99674bb855aadf01404693a0227524cf028361ab24d30be198fcebc | d812f1cde99674bb855aadf01404693a0227524cf028361ab24d30be198fcebc | no |
| src/import/LocalImport.worker.js | 03c689b02930e6d01ce56fa78d1a99c5424b56b47e4e7f54cccfe17c79c5edf8 | 03c689b02930e6d01ce56fa78d1a99c5424b56b47e4e7f54cccfe17c79c5edf8 | 8ac39e47f7b2d4b362bf68229f06ad108883e0f450071805a580ec9d33c53847 | 8ac39e47f7b2d4b362bf68229f06ad108883e0f450071805a580ec9d33c53847 | no |
| src/import/SketchUpImport.js | ec309cdb9a19a37c6af0973f3a54ab957eb43fd3d085bb533770bb3de7ece156 | ec309cdb9a19a37c6af0973f3a54ab957eb43fd3d085bb533770bb3de7ece156 | 843c5217c09df86f191f07c40e43d39fb0ef56a10cb886e973bc49ec79437a66 | 843c5217c09df86f191f07c40e43d39fb0ef56a10cb886e973bc49ec79437a66 | no |
| src/render/ImportedMaterialEditor.js | d67d8265084734cfdcfb783b6443f725d0368ddd87e6c0b9146134a7ad8b234f | d67d8265084734cfdcfb783b6443f725d0368ddd87e6c0b9146134a7ad8b234f | 003896e6bbaba5dd96ecfd817aab1a51744d2da7e4f7d35b98bea69f9e8b5ecc | 003896e6bbaba5dd96ecfd817aab1a51744d2da7e4f7d35b98bea69f9e8b5ecc | no |

## da4f4463c9d8fbb9f065b7ecb0b10c1377f1825132c421f7e865197fd1d5f4b8

Message: Fix large SKP heap exhaustion with bounded TLV decoding, demand-loaded components and source geometry release; verified original 169 MiB file, 13 objects and 2.89M triangles

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/SKP_IMPORT.md | d8fcfb4a1535ab1ed5556a27f4408090f46505bb895b3a844d22ff7db02372cc | d8fcfb4a1535ab1ed5556a27f4408090f46505bb895b3a844d22ff7db02372cc | e8fa8497211e4568b7d00a42474426f75ad3adefc2a9dacd97b88c7b7c3ddf88 | e8fa8497211e4568b7d00a42474426f75ad3adefc2a9dacd97b88c7b7c3ddf88 | no |
| public/shared/skp/PandaSkp.js | 2a8a2e64620821561561972c1b19583aea6cc9136da956e4c50f7b1b1c5b1e07 | 2a8a2e64620821561561972c1b19583aea6cc9136da956e4c50f7b1b1c5b1e07 | c7579213f724b81b55ca36936f1b949b2cc0fe183b19887272c249228f4f5a01 | c7579213f724b81b55ca36936f1b949b2cc0fe183b19887272c249228f4f5a01 | no |
| scripts/build-skp-runtime.cjs | 300fab35b2ea10d5ea09836d381e1fcdaa91708227bba048166da82ffb752053 | 300fab35b2ea10d5ea09836d381e1fcdaa91708227bba048166da82ffb752053 | fafe7190722badfcc4e830378ed08f192bc0c2b888432814926b4226c750ed72 | fafe7190722badfcc4e830378ed08f192bc0c2b888432814926b4226c750ed72 | no |
| scripts/test-skp-browser.cjs | 1b9d8e9e69fdb8cc31d6230da660fbf8b52b50cf7e4d0d0cf8020210eb1a154c | 1b9d8e9e69fdb8cc31d6230da660fbf8b52b50cf7e4d0d0cf8020210eb1a154c | 590e988640d36f721bede3d6a6006fd33f70e184f6ebd60ec211f940926866e0 | 590e988640d36f721bede3d6a6006fd33f70e184f6ebd60ec211f940926866e0 | no |
| scripts/test-skp-import.cjs | 30c788b39a351ee13f875d8f2454a15303e7132d3941520310173a2d6ee37d2c | 30c788b39a351ee13f875d8f2454a15303e7132d3941520310173a2d6ee37d2c | eaf2f3867d617e4d4ef6b53c3321f606cf22718bad0509e5ed7ac04b4339398d | eaf2f3867d617e4d4ef6b53c3321f606cf22718bad0509e5ed7ac04b4339398d | no |
| src/import/SketchUpImport.js | 843c5217c09df86f191f07c40e43d39fb0ef56a10cb886e973bc49ec79437a66 | 843c5217c09df86f191f07c40e43d39fb0ef56a10cb886e973bc49ec79437a66 | 0277834d8e4786c187676474c5de04405def73596107aa4e6149544c9bb64f14 | 0277834d8e4786c187676474c5de04405def73596107aa4e6149544c9bb64f14 | no |

## ab32b6f8a0e003ff47b72efcf21b740d5086f8d52acddda8507a6ff00911747c

Message: Fix internal instance selection with edge-only highlights, no face tint or triangle diagonals; validate hole boundaries, draw ranges, transforms, isolation and geometry lifetime

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/SKP_IMPORT.md | e8fa8497211e4568b7d00a42474426f75ad3adefc2a9dacd97b88c7b7c3ddf88 | e8fa8497211e4568b7d00a42474426f75ad3adefc2a9dacd97b88c7b7c3ddf88 | 30a16c85a330ab735845b0c037f9e29bff114be3203ad702cd341326ce090b02 | 30a16c85a330ab735845b0c037f9e29bff114be3203ad702cd341326ce090b02 | no |
| scripts/test-skp-browser.cjs | 590e988640d36f721bede3d6a6006fd33f70e184f6ebd60ec211f940926866e0 | 590e988640d36f721bede3d6a6006fd33f70e184f6ebd60ec211f940926866e0 | 752c9bf8e66e2ccf2f4cd7accbd5c7b1af09be77a954d9fca64c6cb041cb8120 | 752c9bf8e66e2ccf2f4cd7accbd5c7b1af09be77a954d9fca64c6cb041cb8120 | no |
| scripts/test-skp-import.cjs | eaf2f3867d617e4d4ef6b53c3321f606cf22718bad0509e5ed7ac04b4339398d | eaf2f3867d617e4d4ef6b53c3321f606cf22718bad0509e5ed7ac04b4339398d | e71022093aa8d858ea6e0f631ba619bfdcfd71ce2882a7538bfbe1bd057ab85f | e71022093aa8d858ea6e0f631ba619bfdcfd71ce2882a7538bfbe1bd057ab85f | no |
| src/display/GroupEditContext.js | 83bf34c5fa3b38a490197d52df3ee3427381450ee72d235ae82821ff50772ffd | 83bf34c5fa3b38a490197d52df3ee3427381450ee72d235ae82821ff50772ffd | e7c2d1f018f1ee1faa781d09eca8a80d2645de88d7119b64fd671c6daa1e1bf1 | e7c2d1f018f1ee1faa781d09eca8a80d2645de88d7119b64fd671c6daa1e1bf1 | no |
| src/display/SceneSelection.js | aba9de6c2dabb0a05ab362580f61cd053abb07ac9983b2cfe4212c0d730deb7f | aba9de6c2dabb0a05ab362580f61cd053abb07ac9983b2cfe4212c0d730deb7f | 87228da057a6e78e2768c659f8cea452eb3b32b6a34e7c0d34ec48d89e9ebc5b | 87228da057a6e78e2768c659f8cea452eb3b32b6a34e7c0d34ec48d89e9ebc5b | no |

## f67811d778569d45ef6842c8fbd21a9c0afa7deadcfb07caf72f60e7b3a35b1b

Message: Improve STEP parsing, mapped assemblies, source-face recovery and native span validation; validated parser, Brep, poles and 70-object model

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 036a1950b7b767274302bd0a25afb318a3e6d748c85ffed2c258ee5e43d6755b | 036a1950b7b767274302bd0a25afb318a3e6d748c85ffed2c258ee5e43d6755b | d64f11e1a745a8d96f0c37005e63c3330282b64b495ffeeb08b41cf841d8aac0 | d64f11e1a745a8d96f0c37005e63c3330282b64b495ffeeb08b41cf841d8aac0 | no |
| public/nodec/NodeC.js | 5eb256486fba03999d808949a4aafc23bcc18ee8648cf1fbc7a80385ba81bdcb | 5eb256486fba03999d808949a4aafc23bcc18ee8648cf1fbc7a80385ba81bdcb | 6902e04b56e37a20bb16e6f60becfb4492321cfbfd51e08a79dc233d9c9fa56a | 6902e04b56e37a20bb16e6f60becfb4492321cfbfd51e08a79dc233d9c9fa56a | no |
| public/nodec/NodeC.wasm | b079482d1d2c13a5f3f2e56829297839997089d3b6f29475a1c52ee3ca9bb88c | b079482d1d2c13a5f3f2e56829297839997089d3b6f29475a1c52ee3ca9bb88c | d0f15fbff246519c6bf9c20e78cc43b03e2c5f6803368dee41ff45a67f184b34 | d0f15fbff246519c6bf9c20e78cc43b03e2c5f6803368dee41ff45a67f184b34 | no |
| scripts/test-step-opennurbs.cjs | f93ed06d2249b48b3152d11a82178210f9816eddb75aa7ba0d3a1cae6e491114 | f93ed06d2249b48b3152d11a82178210f9816eddb75aa7ba0d3a1cae6e491114 | 12292bc5004f61b23f4d10fbfc1b808d9d4c870cbc0f40e93ced83ce615d22c0 | 12292bc5004f61b23f4d10fbfc1b808d9d4c870cbc0f40e93ced83ce615d22c0 | no |
| scripts/test-step-part21.cjs | 37a5329c55ed78d0f608ec9706ab35fe935995e24b62c0eb0a4d8aca70e8563e | 37a5329c55ed78d0f608ec9706ab35fe935995e24b62c0eb0a4d8aca70e8563e | d416ece023e17a18813d35692f52d8e907fa10d128bfad0c48e29cacc7a8b397 | d416ece023e17a18813d35692f52d8e907fa10d128bfad0c48e29cacc7a8b397 | no |
| src/import/ProgressiveStepImport.js | f0e9dc0ba6ac8b23a12de6a170dd285ed2c1f37d831f866d2c4e4460865341fe | f0e9dc0ba6ac8b23a12de6a170dd285ed2c1f37d831f866d2c4e4460865341fe | 903a90ab2fdd742fbf66f58971af4cc4ff1ff31c72468f039fe97eb4f1d9a88d | 903a90ab2fdd742fbf66f58971af4cc4ff1ff31c72468f039fe97eb4f1d9a88d | no |
| src/import/StepBrep.js | b07d52f75822d3f46e5807c2154cf75d493e11e02a2c3cd5ccb6c768f15825ad | b07d52f75822d3f46e5807c2154cf75d493e11e02a2c3cd5ccb6c768f15825ad | 9ac2244c72975bb5fb27e950da6f98ad1d5078851230d8443251e85aba39648a | 9ac2244c72975bb5fb27e950da6f98ad1d5078851230d8443251e85aba39648a | no |
| src/import/StepEntityModel.js | 787be9ce9fc329b6a45b71762ec96375d94efac9a09d96b076bcdf9d94a46fc7 | 787be9ce9fc329b6a45b71762ec96375d94efac9a09d96b076bcdf9d94a46fc7 | 25c403a09258813f881591f3096ee00fa75c079fcae1dcc995bcae122ddaa8d0 | 25c403a09258813f881591f3096ee00fa75c079fcae1dcc995bcae122ddaa8d0 | no |
| src/import/StepNativeImport.js | b4e0545c8009754073f3a993c574ce44df029dc5fe8f58bc16c7640077e8821b | b4e0545c8009754073f3a993c574ce44df029dc5fe8f58bc16c7640077e8821b | 99857b25c110ca53f961ea6c7aaee4d39ff8b5fda8f76f4c4cabe45b27f800c6 | 99857b25c110ca53f961ea6c7aaee4d39ff8b5fda8f76f4c4cabe45b27f800c6 | no |
| src/import/StepOpenNurbsImport.js | 21b7f6b65e4034f87e12ffdc63b7db8a42e60c9b7061d4beb511330b0726c9a1 | 21b7f6b65e4034f87e12ffdc63b7db8a42e60c9b7061d4beb511330b0726c9a1 | c2d257d55afd5d87a17f44be1adad639050d4c9ec6e0e156f79cde77ba2fe063 | c2d257d55afd5d87a17f44be1adad639050d4c9ec6e0e156f79cde77ba2fe063 | no |
| src/import/StepPart21.js | 8910fcddfe6bbb6816e37a779ab95b5d741c73c266039d717cf219ff1a863551 | 8910fcddfe6bbb6816e37a779ab95b5d741c73c266039d717cf219ff1a863551 | 6309f60c43610a17049b056f981eee3cd8e6f682d555dacde6edd14ae9db2cd3 | 6309f60c43610a17049b056f981eee3cd8e6f682d555dacde6edd14ae9db2cd3 | no |

## dcf18fce156bb2caa61ea99f76703bc6d0e8744ce27f907b3d355c971b8e6707

Message: Optimize large STEP indexing, dependency reads and diagnostics

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | d64f11e1a745a8d96f0c37005e63c3330282b64b495ffeeb08b41cf841d8aac0 | d64f11e1a745a8d96f0c37005e63c3330282b64b495ffeeb08b41cf841d8aac0 | cf1b498f429b312e0bb323da70b586d7a5013d20f2dbfbbbc7c057aa7bc167a0 | cf1b498f429b312e0bb323da70b586d7a5013d20f2dbfbbbc7c057aa7bc167a0 | no |
| scripts/test-step-part21.cjs | d416ece023e17a18813d35692f52d8e907fa10d128bfad0c48e29cacc7a8b397 | d416ece023e17a18813d35692f52d8e907fa10d128bfad0c48e29cacc7a8b397 | f6280d8c1cc7a6be7c7424223a483293aee54150546b7dabdcadbe85bec44a7c | f6280d8c1cc7a6be7c7424223a483293aee54150546b7dabdcadbe85bec44a7c | no |
| src/import/ProgressiveStepImport.js | 903a90ab2fdd742fbf66f58971af4cc4ff1ff31c72468f039fe97eb4f1d9a88d | 903a90ab2fdd742fbf66f58971af4cc4ff1ff31c72468f039fe97eb4f1d9a88d | caa829ee446ae16784465e75873629322db8935b0a89801e11743438819f54a3 | caa829ee446ae16784465e75873629322db8935b0a89801e11743438819f54a3 | no |
| src/import/StepOpenNurbsImport.js | c2d257d55afd5d87a17f44be1adad639050d4c9ec6e0e156f79cde77ba2fe063 | c2d257d55afd5d87a17f44be1adad639050d4c9ec6e0e156f79cde77ba2fe063 | bd8a2510b4587bd80379b3fb3064a58ed396f766929a0823d94e8a6b26b4c872 | bd8a2510b4587bd80379b3fb3064a58ed396f766929a0823d94e8a6b26b4c872 | no |
| src/import/StepPart21.js | 6309f60c43610a17049b056f981eee3cd8e6f682d555dacde6edd14ae9db2cd3 | 6309f60c43610a17049b056f981eee3cd8e6f682d555dacde6edd14ae9db2cd3 | 45cb5b2aa97a575be97acd99a91d5ba37e3ce00f7d030025011eda7bbc2db822 | 45cb5b2aa97a575be97acd99a91d5ba37e3ce00f7d030025011eda7bbc2db822 | no |

## dd6deee42ab607622a728fff24c0693e0e0a4cc93fd70f6bb93c977f3694f22a

Message: Accept sparse STEP headers in browser regression

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| scripts/test-step-progressive-browser.cjs | 69e8783b3c655c954b104fc6062552c65ea5c818520d7e8121dd1d6ca700a732 | 69e8783b3c655c954b104fc6062552c65ea5c818520d7e8121dd1d6ca700a732 | 94967040c9271343900f4d5d67b550b16b1432e048a72540ffc8112db645ea2f | 94967040c9271343900f4d5d67b550b16b1432e048a72540ffc8112db645ea2f | no |

## a117e357e8a1ccb6526bc69a9dc5775493ec50bd5ad27673ae666ed9ae8b31e5

Message: Prevent STEP global manifold recovery loops and preserve valid partial Breps

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/nodec/NodeC.js | 6902e04b56e37a20bb16e6f60becfb4492321cfbfd51e08a79dc233d9c9fa56a | 6902e04b56e37a20bb16e6f60becfb4492321cfbfd51e08a79dc233d9c9fa56a | 3155035aa0530dc4b6c1ec73e0477c6781f5e06ddf94a32ab890e4f79bd2ee93 | 3155035aa0530dc4b6c1ec73e0477c6781f5e06ddf94a32ab890e4f79bd2ee93 | no |
| public/nodec/NodeC.wasm | d0f15fbff246519c6bf9c20e78cc43b03e2c5f6803368dee41ff45a67f184b34 | d0f15fbff246519c6bf9c20e78cc43b03e2c5f6803368dee41ff45a67f184b34 | 6e523e2ad157c56c0518de03e5ba08a001932c459054ca6a006009729c93ed6d | 6e523e2ad157c56c0518de03e5ba08a001932c459054ca6a006009729c93ed6d | no |
| src/import/StepOpenNurbsImport.js | bd8a2510b4587bd80379b3fb3064a58ed396f766929a0823d94e8a6b26b4c872 | bd8a2510b4587bd80379b3fb3064a58ed396f766929a0823d94e8a6b26b4c872 | 4e4daa10f86ff204632bf82e0567da8b86097c9477b8ac885c4a6bf99f74ac9b | 4e4daa10f86ff204632bf82e0567da8b86097c9477b8ac885c4a6bf99f74ac9b | no |

## c8670200ee70e65a3bee227258b2539f86675e725798d01b6212856ef82317ea

Message: Report retained STEP Breps that pass validity but fail global manifold checks

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/ProgressiveStepImport.js | caa829ee446ae16784465e75873629322db8935b0a89801e11743438819f54a3 | caa829ee446ae16784465e75873629322db8935b0a89801e11743438819f54a3 | 467867f53f867030411c5c32ae669a986e6104943401e374cd023d4b5f9bce79 | 467867f53f867030411c5c32ae669a986e6104943401e374cd023d4b5f9bce79 | no |

## d3628b2d858a82bdd015eae73be07a511a08a11240f6b36f8422c53121ef4646

Message: Persist STEP non-manifold recovery diagnostics

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/StepOpenNurbsImport.js | 4e4daa10f86ff204632bf82e0567da8b86097c9477b8ac885c4a6bf99f74ac9b | 4e4daa10f86ff204632bf82e0567da8b86097c9477b8ac885c4a6bf99f74ac9b | e6428b8921063c3a93903d93742f65d00b73f6dca360672de50030e2985a61db | e6428b8921063c3a93903d93742f65d00b73f6dca360672de50030e2985a61db | no |

## 0ae08d70951e45929d75ff6b95decf8e415226ab3921a6bc37908460bb9da298

Message: Fix STEP UV seam validation by snapping tolerance-safe trim endpoints

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/nodec/NodeC.wasm | 6e523e2ad157c56c0518de03e5ba08a001932c459054ca6a006009729c93ed6d | 6e523e2ad157c56c0518de03e5ba08a001932c459054ca6a006009729c93ed6d | a89e2fe9bc28a2af7675d9d4e767c026bde47fed16f7d0e54645fc44136e8fd2 | a89e2fe9bc28a2af7675d9d4e767c026bde47fed16f7d0e54645fc44136e8fd2 | no |

## 5f2e604f48800324d2c81c66599a180e6f6b481fe2941421a9949ac7640be961

Message: Add frontend DWG decoding through the existing DXF display pipeline

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| package.json | absent | 970368a4856b9f9fa00f3b6fe548c3f30ccb973aacae2dc022abd1189bdb219a | 877377cdc9487efac4b414f8d4ca6a53fa786ab5825a101aeaea4ec5a7c0bbc0 | 877377cdc9487efac4b414f8d4ca6a53fa786ab5825a101aeaea4ec5a7c0bbc0 | yes |
| public/shared/libredwg/GPL-3.0.txt | absent | absent | 3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986 | 3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986 | no |
| public/shared/libredwg/NOTICE.txt | absent | absent | d4f8270db0776e90d086881161973560262a10bb351966a9e39b8b0b4d332aa1 | d4f8270db0776e90d086881161973560262a10bb351966a9e39b8b0b4d332aa1 | no |
| public/shared/libredwg/libredwg-web.wasm | absent | absent | 8f8dbfe1ba3a0ae9ceb8856ed2090c0f44decd9d7febde68016df8c1fca50f9b | 8f8dbfe1ba3a0ae9ceb8856ed2090c0f44decd9d7febde68016df8c1fca50f9b | no |
| quasar.conf.js | b8c370516b8428d760649667c3dcba55afe57b689caa358b12dc1300bb31a6dc | 2622fa776f3fec02939025f3b42fdaeef98c128af48119ef4055dfb37368c53c | c4bf7f86ccf6fe25e8a04bc1aa570d36d59da12e5769ee54ab7d0befed10f480 | c4bf7f86ccf6fe25e8a04bc1aa570d36d59da12e5769ee54ab7d0befed10f480 | yes |
| src/import/LibredwgImport.js | absent | absent | 22721631408af3660dd4c548ba8d36643b029a702d9f8a04ba50084dda64fd85 | 22721631408af3660dd4c548ba8d36643b029a702d9f8a04ba50084dda64fd85 | no |
| src/import/LocalImport.worker.js | 8ac39e47f7b2d4b362bf68229f06ad108883e0f450071805a580ec9d33c53847 | 8ac39e47f7b2d4b362bf68229f06ad108883e0f450071805a580ec9d33c53847 | b67ec2f6be8fa6f0b7247616e1322ac552b245b37d66da2f3a16eaff12455e7a | b67ec2f6be8fa6f0b7247616e1322ac552b245b37d66da2f3a16eaff12455e7a | no |
| src/import/ModelFileFormats.js | 2a16ac62b9840d5d8729c21534943a73e804f8e32187d19b2b6eb4b5ff0698cb | 2a16ac62b9840d5d8729c21534943a73e804f8e32187d19b2b6eb4b5ff0698cb | 710deeb90a33f53563916409ba6cd23601210d685be98bcaf0ad9843c2005dc8 | 710deeb90a33f53563916409ba6cd23601210d685be98bcaf0ad9843c2005dc8 | no |
| src/layouts/MainLayout.vue | ffe658fe4043c1959b06354b16a01575e1a8340abd5394865cb4012e05fe066f | ffe658fe4043c1959b06354b16a01575e1a8340abd5394865cb4012e05fe066f | bdcce2b616fb9bd5997effc526f1dcf5acf3f742483ec8fbe6b5c71c6f07c1b9 | bdcce2b616fb9bd5997effc526f1dcf5acf3f742483ec8fbe6b5c71c6f07c1b9 | no |
| yarn.lock | 2b3ced1a70b84e17b18338011c6ae5148aec2612129bab4a529c369cfb509800 | 2b3ced1a70b84e17b18338011c6ae5148aec2612129bab4a529c369cfb509800 | f34a21cfad20e8989e30918497fd1382daebcf0a46f11d04b32ac850105f0184 | f34a21cfad20e8989e30918497fd1382daebcf0a46f11d04b32ac850105f0184 | yes |

## 928a8bbe01cf08d6e5fdbfd6e7d0e435f8c6c69d523bddb486019a280804d1a7

Message: Fix STEP trimmed curve import for Rhino exported files

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/StepBrep.js | 9ac2244c72975bb5fb27e950da6f98ad1d5078851230d8443251e85aba39648a | 9ac2244c72975bb5fb27e950da6f98ad1d5078851230d8443251e85aba39648a | e662ff28cd883c916aa5b2e06fd4a5a828ae40bf65fcdd5264360d729a0c4ef7 | e662ff28cd883c916aa5b2e06fd4a5a828ae40bf65fcdd5264360d729a0c4ef7 | no |
| src/import/StepGeometry.js | ed0f37949be1f7eaf39d94f532b97f909cd0448a8157155fdb9bd9ad3ee2b13c | ed0f37949be1f7eaf39d94f532b97f909cd0448a8157155fdb9bd9ad3ee2b13c | c62a915877ccda486e703e85afc93a9ba04bc92637121101b8cc46bc1b5b230e | c62a915877ccda486e703e85afc93a9ba04bc92637121101b8cc46bc1b5b230e | no |

## 039df0c452e133049aab8fea87d40a21632eadc2fc28cc5d88ab9e7871d06e8b

Message: Partition STEP wireframe metadata and retain recoverable faces

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/StepBrep.js | e662ff28cd883c916aa5b2e06fd4a5a828ae40bf65fcdd5264360d729a0c4ef7 | e662ff28cd883c916aa5b2e06fd4a5a828ae40bf65fcdd5264360d729a0c4ef7 | ba259fc45a5251fee13c9dc169d54d08bb5a810c9e4d3df02ebb843d62f143e4 | ba259fc45a5251fee13c9dc169d54d08bb5a810c9e4d3df02ebb843d62f143e4 | no |
| src/import/StepNativeImport.js | 99857b25c110ca53f961ea6c7aaee4d39ff8b5fda8f76f4c4cabe45b27f800c6 | 99857b25c110ca53f961ea6c7aaee4d39ff8b5fda8f76f4c4cabe45b27f800c6 | 8b029636983f4c75a779ffd81f6a467c8f358701f8e78cdb7898ceef946eeb6a | 8b029636983f4c75a779ffd81f6a467c8f358701f8e78cdb7898ceef946eeb6a | no |
| src/import/StepOpenNurbsImport.js | e6428b8921063c3a93903d93742f65d00b73f6dca360672de50030e2985a61db | e6428b8921063c3a93903d93742f65d00b73f6dca360672de50030e2985a61db | 49e1c0d07263f88c733aa14bf0f2236bfaaadafd8cdc01338c98017cb631d968 | 49e1c0d07263f88c733aa14bf0f2236bfaaadafd8cdc01338c98017cb631d968 | no |
| src/import/StepPart21.js | 45cb5b2aa97a575be97acd99a91d5ba37e3ce00f7d030025011eda7bbc2db822 | 45cb5b2aa97a575be97acd99a91d5ba37e3ce00f7d030025011eda7bbc2db822 | 8644a3013232fcff41a0c0f293cd8c1bae3bf0c8dcc0b75affb4532ed4257539 | 8644a3013232fcff41a0c0f293cd8c1bae3bf0c8dcc0b75affb4532ed4257539 | no |

## 49203f73ec657fb3d780d19d3216761334752e43f35850326234d4e6d9b9d905

Message: Add surface-path diagnostics and bounded display mesh recovery

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/nodec/BrepMeshing.js | 9fce3d084b64c18daa8bbd7e02733bd3f896ef0b9fc2d3ad6547d86e8fdf51c4 | 9fce3d084b64c18daa8bbd7e02733bd3f896ef0b9fc2d3ad6547d86e8fdf51c4 | b07da82b61bcd93e1b7e57a67c82399e028c7775110346e5c0237000ac77514d | b07da82b61bcd93e1b7e57a67c82399e028c7775110346e5c0237000ac77514d | no |
| public/nodec/NodeC.js | 3155035aa0530dc4b6c1ec73e0477c6781f5e06ddf94a32ab890e4f79bd2ee93 | 3155035aa0530dc4b6c1ec73e0477c6781f5e06ddf94a32ab890e4f79bd2ee93 | 92778a3cd6f962b4bc422246da6e7070f2f7d14e8a8839064eb481fd190999c3 | 92778a3cd6f962b4bc422246da6e7070f2f7d14e8a8839064eb481fd190999c3 | no |
| public/nodec/NodeC.wasm | a89e2fe9bc28a2af7675d9d4e767c026bde47fed16f7d0e54645fc44136e8fd2 | a89e2fe9bc28a2af7675d9d4e767c026bde47fed16f7d0e54645fc44136e8fd2 | 1811ffaef9b4b6e2fae177ca89e8617e951220dacaec7a578596a0308bf7d163 | 1811ffaef9b4b6e2fae177ca89e8617e951220dacaec7a578596a0308bf7d163 | no |
| src/PandaUIDoc.js | f3fc0b54ef227d71a0792c376775653990172b46841950c433ad61821b74e121 | f3fc0b54ef227d71a0792c376775653990172b46841950c433ad61821b74e121 | 2d718e1b5a25e1acdd993613b00953e3961a3ae19d915725d8ef81391539a966 | 2d718e1b5a25e1acdd993613b00953e3961a3ae19d915725d8ef81391539a966 | no |

## 4ac97a94d175146dabebfbfb969b70cc1212e0b8c9039ca9772cb4f9b22e1d9b

Message: Support STEP BREP_WITH_VOIDS and exact toroidal surfaces

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/StepBrep.js | ba259fc45a5251fee13c9dc169d54d08bb5a810c9e4d3df02ebb843d62f143e4 | ba259fc45a5251fee13c9dc169d54d08bb5a810c9e4d3df02ebb843d62f143e4 | a51c63753e58dd2cc48b02e7261e8612f81f432909a23dc9f613a6267462c65b | a51c63753e58dd2cc48b02e7261e8612f81f432909a23dc9f613a6267462c65b | no |
| src/import/StepGeometry.js | c62a915877ccda486e703e85afc93a9ba04bc92637121101b8cc46bc1b5b230e | c62a915877ccda486e703e85afc93a9ba04bc92637121101b8cc46bc1b5b230e | bb7ce8a79f9a74a478ac12ec9604063da66e9638c6c2256073e36ee083541487 | bb7ce8a79f9a74a478ac12ec9604063da66e9638c6c2256073e36ee083541487 | no |
| src/import/StepNativeImport.js | 8b029636983f4c75a779ffd81f6a467c8f358701f8e78cdb7898ceef946eeb6a | 8b029636983f4c75a779ffd81f6a467c8f358701f8e78cdb7898ceef946eeb6a | c0885133b4be99c4beb21c8a225ead160da02278a5df98a352c3b11c97735556 | c0885133b4be99c4beb21c8a225ead160da02278a5df98a352c3b11c97735556 | no |
| src/import/StepOpenNurbsImport.js | 49e1c0d07263f88c733aa14bf0f2236bfaaadafd8cdc01338c98017cb631d968 | 49e1c0d07263f88c733aa14bf0f2236bfaaadafd8cdc01338c98017cb631d968 | b1f955f7dcd03b322683470897bb0da20c830f56aa5c952b6160975adfd62b22 | b1f955f7dcd03b322683470897bb0da20c830f56aa5c952b6160975adfd62b22 | no |

## 91a84016c32be7e89e2fc025a5cc51679b8fe75f863792d670e38cfd8680df7a

Message: Recover ambiguous periodic STEP loops in NodeC

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/nodec/NodeC.wasm | 1811ffaef9b4b6e2fae177ca89e8617e951220dacaec7a578596a0308bf7d163 | 1811ffaef9b4b6e2fae177ca89e8617e951220dacaec7a578596a0308bf7d163 | 66c6085b534c16f523c09b2dc26496b8f7be7d3ec979cf683bb01984b3ad7e13 | 66c6085b534c16f523c09b2dc26496b8f7be7d3ec979cf683bb01984b3ad7e13 | no |

## 29385437d336f061321225c19033dea285d3e6a95451682a429e4633d04c23a9

Message: Fix STEP void shell orientation and rational torus trims; enable bounded native recovery for small parts; owned cavity and torus regressions passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | cf1b498f429b312e0bb323da70b586d7a5013d20f2dbfbbbc7c057aa7bc167a0 | cf1b498f429b312e0bb323da70b586d7a5013d20f2dbfbbbc7c057aa7bc167a0 | 61ddc2e5ad3601a238c3057d155e755a3a7ef2b64218410466393f0136405caa | 61ddc2e5ad3601a238c3057d155e755a3a7ef2b64218410466393f0136405caa | no |
| public/nodec/NodeC.wasm | 66c6085b534c16f523c09b2dc26496b8f7be7d3ec979cf683bb01984b3ad7e13 | 66c6085b534c16f523c09b2dc26496b8f7be7d3ec979cf683bb01984b3ad7e13 | 3c1ac449c1606ce14cc67928c4122d72201c3e25531e557d2344670012dc5e3a | 3c1ac449c1606ce14cc67928c4122d72201c3e25531e557d2344670012dc5e3a | no |
| scripts/test-step-brep.cjs | 25db270258c45690ea410cf6c9b49dbb97ba478d38304ccbd0221f567f105736 | 25db270258c45690ea410cf6c9b49dbb97ba478d38304ccbd0221f567f105736 | e7a06ba0b704f457d21d62e1ef927ecc2925709688acb6771d4a71cc4c4a4ec0 | e7a06ba0b704f457d21d62e1ef927ecc2925709688acb6771d4a71cc4c4a4ec0 | no |
| scripts/test-step-opennurbs.cjs | 12292bc5004f61b23f4d10fbfc1b808d9d4c870cbc0f40e93ced83ce615d22c0 | 12292bc5004f61b23f4d10fbfc1b808d9d4c870cbc0f40e93ced83ce615d22c0 | b431bb82e2ab6bdfb9e586a9b6c00ebf7da92c1d21fe3cda5ac01a2b64e259d8 | b431bb82e2ab6bdfb9e586a9b6c00ebf7da92c1d21fe3cda5ac01a2b64e259d8 | no |
| src/import/StepBrep.js | a51c63753e58dd2cc48b02e7261e8612f81f432909a23dc9f613a6267462c65b | a51c63753e58dd2cc48b02e7261e8612f81f432909a23dc9f613a6267462c65b | d6c37980a046946a7f68e6e7002a5a46e247bf70d648a42554d3c283a09f9cf8 | d6c37980a046946a7f68e6e7002a5a46e247bf70d648a42554d3c283a09f9cf8 | no |
| src/import/StepOpenNurbsImport.js | b1f955f7dcd03b322683470897bb0da20c830f56aa5c952b6160975adfd62b22 | b1f955f7dcd03b322683470897bb0da20c830f56aa5c952b6160975adfd62b22 | 980ba0d82ddd9acab1582beaa6db880f3664d0c773ccd3077e82e5c50389681d | 980ba0d82ddd9acab1582beaa6db880f3664d0c773ccd3077e82e5c50389681d | no |

## 10cdfb07bde6e8ad671574f80d6a4562adf14df78dca02235c6a8a3504b71ad4

Message: Keep STEP auxiliary geometric sets in their topology dependency jobs; full Part21 regressions passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/import/StepPart21.js | 8644a3013232fcff41a0c0f293cd8c1bae3bf0c8dcc0b75affb4532ed4257539 | 8644a3013232fcff41a0c0f293cd8c1bae3bf0c8dcc0b75affb4532ed4257539 | 5096413a1d5f877ced9199841d4bb922dcf9e8d4ac6d5189b7b0d52702a8845b | 5096413a1d5f877ced9199841d4bb922dcf9e8d4ac6d5189b7b0d52702a8845b | no |

## 54ab93359755ae3dcad23d032f699e2793e6aeed37bcc35ee05e967d97ec5ef0

Message: Document safe auxiliary STEP set grouping and completed Part21 regression validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 61ddc2e5ad3601a238c3057d155e755a3a7ef2b64218410466393f0136405caa | 61ddc2e5ad3601a238c3057d155e755a3a7ef2b64218410466393f0136405caa | c136bec1b7eb38ce0b7326eaf33132e9b9d8ee830a3cf3391302db65207f495c | c136bec1b7eb38ce0b7326eaf33132e9b9d8ee830a3cf3391302db65207f495c | no |

## 1bb80e9d5d12f80c20e3ad504fe1090298796780808cfa23b9010f9a2aa69497

Message: Preserve narrow STEP periodic faces when selecting UV branches; native six-object 323-face import and STEP Brep regressions passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | c136bec1b7eb38ce0b7326eaf33132e9b9d8ee830a3cf3391302db65207f495c | c136bec1b7eb38ce0b7326eaf33132e9b9d8ee830a3cf3391302db65207f495c | 83d55b9101b1bf29563ad364b47812ee1ca3f731c1e2a0fbdf8a6d12b3e12c27 | 83d55b9101b1bf29563ad364b47812ee1ca3f731c1e2a0fbdf8a6d12b3e12c27 | no |
| public/nodec/NodeC.wasm | 3c1ac449c1606ce14cc67928c4122d72201c3e25531e557d2344670012dc5e3a | 3c1ac449c1606ce14cc67928c4122d72201c3e25531e557d2344670012dc5e3a | 2793a81d00e8422c69b5ff03a0dc88f926dd555058ccec8975e3063b10ddd6f9 | 2793a81d00e8422c69b5ff03a0dc88f926dd555058ccec8975e3063b10ddd6f9 | no |
| scripts/test-step-brep.cjs | e7a06ba0b704f457d21d62e1ef927ecc2925709688acb6771d4a71cc4c4a4ec0 | e7a06ba0b704f457d21d62e1ef927ecc2925709688acb6771d4a71cc4c4a4ec0 | 909c2b63bc282737bc7b8893c466755d750cc4296b69714f69b051a88ae08187 | 909c2b63bc282737bc7b8893c466755d750cc4296b69714f69b051a88ae08187 | no |

## 82a2b3d9464ef6ab3a12a938cc16955c049c6aed7d3f763612ba5ab8171caaa6

Message: Preserve both lobes of touching STEP holes and shared boundary constraints; STEP archive and mesh regressions passed, source-gap warnings retained

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | 83d55b9101b1bf29563ad364b47812ee1ca3f731c1e2a0fbdf8a6d12b3e12c27 | 83d55b9101b1bf29563ad364b47812ee1ca3f731c1e2a0fbdf8a6d12b3e12c27 | c89fddae9df087d5435cdecb2d1191ec3cb73575726037a63047cadf2412bef9 | c89fddae9df087d5435cdecb2d1191ec3cb73575726037a63047cadf2412bef9 | no |
| public/nodec/NodeC.wasm | 2793a81d00e8422c69b5ff03a0dc88f926dd555058ccec8975e3063b10ddd6f9 | 2793a81d00e8422c69b5ff03a0dc88f926dd555058ccec8975e3063b10ddd6f9 | 000f5eac1e4bfb4af74bab66d677dd7165c60e69223d79a4d00d0ac2e9131de4 | 000f5eac1e4bfb4af74bab66d677dd7165c60e69223d79a4d00d0ac2e9131de4 | no |
| scripts/test-step-brep.cjs | 909c2b63bc282737bc7b8893c466755d750cc4296b69714f69b051a88ae08187 | 909c2b63bc282737bc7b8893c466755d750cc4296b69714f69b051a88ae08187 | 16816ccfefc060928c9d7d86fa9fdf5889ed63ca2e0fe27f88d97c25f9729532 | 16816ccfefc060928c9d7d86fa9fdf5889ed63ca2e0fe27f88d97c25f9729532 | no |

## 90da88b13ee1f40f238c25ec154753602a0de376dfa23503a62fbc67c83bd8dd

Message: Replace blocking file-import alerts with selectable diagnostics and Copy/Close controls; ESLint passed and browser regression captures HTML messages

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| scripts/test-step-progressive-browser.cjs | 94967040c9271343900f4d5d67b550b16b1432e048a72540ffc8112db645ea2f | 94967040c9271343900f4d5d67b550b16b1432e048a72540ffc8112db645ea2f | 3e83caef6002999e5ba2cd24f7032bb10c084722b6f94f67d0a305c56a60a87a | 3e83caef6002999e5ba2cd24f7032bb10c084722b6f94f67d0a305c56a60a87a | no |
| src/PandaUIApp.js | be2bd4ddf1fa26b03af29242e1d6b9301dfb3dc27ce275a191030c71d12cffce | be2bd4ddf1fa26b03af29242e1d6b9301dfb3dc27ce275a191030c71d12cffce | 8939892a0fdc211321b76be805808a31bdc5a2fd4bac9eb12e9bb47a440b8d21 | 8939892a0fdc211321b76be805808a31bdc5a2fd4bac9eb12e9bb47a440b8d21 | no |
| src/composables/useModelImport.js | d4b5385e2fc56d048a14cfbc8f2e418600d509a544e0a49353f560246cf72695 | d4b5385e2fc56d048a14cfbc8f2e418600d509a544e0a49353f560246cf72695 | 1600610a1cfb2749aa43ecbc0be1d1681a6bc4b96fc2f194fcc5a4f54db1b470 | 1600610a1cfb2749aa43ecbc0be1d1681a6bc4b96fc2f194fcc5a4f54db1b470 | no |
| src/ui/ImportMessageDialog.js | absent | absent | bedb291db4d3cf020950d01250789fd7b823172a8624b314f751d032c2625e0d | bedb291db4d3cf020950d01250789fd7b823172a8624b314f751d032c2625e0d | no |

## b74a03c18368029f4ef464f3bacbc4b39b996b350f7323a10a510ed417615bae

Message: Keep Copy and Close together on mobile; clipboard, fallback, focus and full STEP browser checks passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | c89fddae9df087d5435cdecb2d1191ec3cb73575726037a63047cadf2412bef9 | c89fddae9df087d5435cdecb2d1191ec3cb73575726037a63047cadf2412bef9 | f502004a76e4d2d84814043c3c6f35c588e86ba9d837fa280cbc773a79ec0457 | f502004a76e4d2d84814043c3c6f35c588e86ba9d837fa280cbc773a79ec0457 | no |
| src/ui/ImportMessageDialog.js | bedb291db4d3cf020950d01250789fd7b823172a8624b314f751d032c2625e0d | bedb291db4d3cf020950d01250789fd7b823172a8624b314f751d032c2625e0d | 1bdc9b6362e99752b56e977c1b8e907b73155c0dfa46ce18bc23715cac257d03 | 1bdc9b6362e99752b56e977c1b8e907b73155c0dfa46ce18bc23715cac257d03 | no |

## 6a7deba42a8eb9ed42b5b5dcd45d7dc463234ffbed6f80917539862fe30332ce

Message: Fix collapsed-side normal refinement stalls and reuse unchanged trim mappings; 226 mesher checks plus degeneracy and UV regressions passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/STEP_IMPORT.md | f502004a76e4d2d84814043c3c6f35c588e86ba9d837fa280cbc773a79ec0457 | f502004a76e4d2d84814043c3c6f35c588e86ba9d837fa280cbc773a79ec0457 | 7b5908d4efb6b35828287c3dc36320f06f28902998984e7e12db4502b457a6b4 | 7b5908d4efb6b35828287c3dc36320f06f28902998984e7e12db4502b457a6b4 | no |
| public/nodec/NodeC.wasm | 000f5eac1e4bfb4af74bab66d677dd7165c60e69223d79a4d00d0ac2e9131de4 | 000f5eac1e4bfb4af74bab66d677dd7165c60e69223d79a4d00d0ac2e9131de4 | 6c4f7ee821eed51bd946482b14abe4be797b37ae9775bd6b4aabb526d93745ed | 6c4f7ee821eed51bd946482b14abe4be797b37ae9775bd6b4aabb526d93745ed | no |

## d6623cfb9695a792e809de913d13789bf9881bcf42cfb6f85ca352d711636942

Message: Add private local document folders: geometry and display packs, safe incremental saves, lazy reopen; validated folder recovery and Edge STEP/3DM round trips

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/FRONTEND_SYNC.md | 410691a566d2d8f68ac4495437ab8634d68a15eb52a3113e824c552436a9a170 | 410691a566d2d8f68ac4495437ab8634d68a15eb52a3113e824c552436a9a170 | 1278c93e22e9dbdbe53addd85f463adb6f79c358dc19141d13d27bc9d5d386dc | 1278c93e22e9dbdbe53addd85f463adb6f79c358dc19141d13d27bc9d5d386dc | no |
| docs/LOCAL_DOCUMENT_STORAGE.md | absent | absent | 90c08a97c34e055d7c6b2ffdf1fd8d5eb7a842f5b71f2073c48b9c0c96f614c0 | 90c08a97c34e055d7c6b2ffdf1fd8d5eb7a842f5b71f2073c48b9c0c96f614c0 | no |
| scripts/sync-frontend-export.cjs | 8ef1ba4c6dfd023fd7b4734ee2165e0dc530671fe3c30f2bc125b2b8131a4489 | 8ef1ba4c6dfd023fd7b4734ee2165e0dc530671fe3c30f2bc125b2b8131a4489 | 9ba7dff3205f2f023c5512a313ab8f4a5cd107429b452178062cd1d5eefc8e73 | 9ba7dff3205f2f023c5512a313ab8f4a5cd107429b452178062cd1d5eefc8e73 | no |
| scripts/test-folder-document-store.cjs | absent | absent | 01640dc5c0b6b8e673c9c2e9dd7173ecb07fcdf015635e814e32925d230b54f8 | 01640dc5c0b6b8e673c9c2e9dd7173ecb07fcdf015635e814e32925d230b54f8 | no |
| scripts/test-local-document-folder-browser.cjs | absent | absent | 64180b1855dcd4c13b3920001f7a4716b24a31fe1ff1ca1c76018bf33d301838 | 64180b1855dcd4c13b3920001f7a4716b24a31fe1ff1ca1c76018bf33d301838 | no |
| scripts/test-step-progressive-browser.cjs | 3e83caef6002999e5ba2cd24f7032bb10c084722b6f94f67d0a305c56a60a87a | 3e83caef6002999e5ba2cd24f7032bb10c084722b6f94f67d0a305c56a60a87a | 9d54804fb4d568dbf2301f06189c6e6af9e017dc46d019928849f1f1b8819e65 | 9d54804fb4d568dbf2301f06189c6e6af9e017dc46d019928849f1f1b8819e65 | no |
| src/DocumentHierarchy.js | afe7bdc8785af5e6ac97f76330f3075ac8cd2cff2d75c2983bca386881bfbbd1 | afe7bdc8785af5e6ac97f76330f3075ac8cd2cff2d75c2983bca386881bfbbd1 | c05d1d158f32b5620012e82576f90b3bc4f45fe166f8a66a5112f4b205622bf9 | c05d1d158f32b5620012e82576f90b3bc4f45fe166f8a66a5112f4b205622bf9 | no |
| src/PandaUIApp.js | 8939892a0fdc211321b76be805808a31bdc5a2fd4bac9eb12e9bb47a440b8d21 | 8939892a0fdc211321b76be805808a31bdc5a2fd4bac9eb12e9bb47a440b8d21 | f30914547c8990895e00685d70a464f498ef0872fcde2d21eb91e328b91e980d | f30914547c8990895e00685d70a464f498ef0872fcde2d21eb91e328b91e980d | no |
| src/PandaUIDoc.js | 2d718e1b5a25e1acdd993613b00953e3961a3ae19d915725d8ef81391539a966 | 2d718e1b5a25e1acdd993613b00953e3961a3ae19d915725d8ef81391539a966 | b631b089d8971ad626133d524c5bd610a5a7a8b1bda8d513135c388a03c03a6d | b631b089d8971ad626133d524c5bd610a5a7a8b1bda8d513135c388a03c03a6d | no |
| src/collaboration/FrontendGeometryExport.worker.js | 74c929f9a2ffe4f7faf6debd782b2198cfe46d1aeaa401764058d13244fdf3b9 | 74c929f9a2ffe4f7faf6debd782b2198cfe46d1aeaa401764058d13244fdf3b9 | f62e41cbf21260c2585916418d30c96d7f135a834c6648de8826c2be589c9312 | f62e41cbf21260c2585916418d30c96d7f135a834c6648de8826c2be589c9312 | no |
| src/collaboration/FrontendGeometryPublisher.js | 28b87b242793a57698a45a8359ff1517ac134313735bceddcee624c61305b4c7 | 28b87b242793a57698a45a8359ff1517ac134313735bceddcee624c61305b4c7 | d5cff3f7e0f64d9618dba7c4f8a991bcc9aa032ad93773c5d0c9a4a1d665ddac | d5cff3f7e0f64d9618dba7c4f8a991bcc9aa032ad93773c5d0c9a4a1d665ddac | no |
| src/collaboration/SceneDisplayPacket.js | d705b3eec37161dd1bb74c4d393eb9c636896901b0bc855edf3780ae5edde148 | d705b3eec37161dd1bb74c4d393eb9c636896901b0bc855edf3780ae5edde148 | 14600b08910fcb7ea67235bbe05a2b1b57eb88ecbe6bd3f4621619ec94f267f0 | 14600b08910fcb7ea67235bbe05a2b1b57eb88ecbe6bd3f4621619ec94f267f0 | no |
| src/collaboration/SceneWorkspace.js | 6d3214eb8711f25e1f03827a9118d1f2c6d0adb21d1d05bd3962401392d406d5 | 6d3214eb8711f25e1f03827a9118d1f2c6d0adb21d1d05bd3962401392d406d5 | d132fba793f0ba4c460e2fc87cf766e902e6767a66d7bbc14a533c9f210a51ae | d132fba793f0ba4c460e2fc87cf766e902e6767a66d7bbc14a533c9f210a51ae | no |
| src/components/GeometryDocumentTree.vue | 96216f271a002e9f6bcd7014aeb572adada0388572bd87b9a09b604b98b9871e | 96216f271a002e9f6bcd7014aeb572adada0388572bd87b9a09b604b98b9871e | d97ff7f3415d581b2fb5c69712b0bba78a141d5ce1c0d54e41847f37cf43fd58 | d97ff7f3415d581b2fb5c69712b0bba78a141d5ce1c0d54e41847f37cf43fd58 | no |
| src/components/SceneDocumentsPanel.vue | f5d1064c9c66dc4ea304cf126d1c2f293600b56a8bf8775983a63b92ca436b84 | f5d1064c9c66dc4ea304cf126d1c2f293600b56a8bf8775983a63b92ca436b84 | cb491e289870b25f5826a39fd873713b63212fb3c45354392e2f249babb337ce | cb491e289870b25f5826a39fd873713b63212fb3c45354392e2f249babb337ce | no |
| src/display/GraphPreviewRegistry.js | 87706c30187ee6bc9dcc17034c55b7e65a1387cc5e0511a595dd2c311266422e | 87706c30187ee6bc9dcc17034c55b7e65a1387cc5e0511a595dd2c311266422e | 7330d715bd82f7d0b71d9744ea8e32b4b8d867b95af7f41486da6072e1b50cb3 | 7330d715bd82f7d0b71d9744ea8e32b4b8d867b95af7f41486da6072e1b50cb3 | no |
| src/display/SceneVisibility.js | ffeed23ef3d5485b8ad6c0b10b7cbf6ad448b49e6216f9075078c07f24a685c6 | ffeed23ef3d5485b8ad6c0b10b7cbf6ad448b49e6216f9075078c07f24a685c6 | fa933aa10d6602e38619199fec271ca20eeb90218a073bf89134fa4725b2c2a4 | fa933aa10d6602e38619199fec271ca20eeb90218a073bf89134fa4725b2c2a4 | no |
| src/import/remeshLocalDocument.js | 636cff1cd594bf70b9edfdb75e62dab07db54cba32721788f7ff3acd6888f64e | 636cff1cd594bf70b9edfdb75e62dab07db54cba32721788f7ff3acd6888f64e | 18a9ab0c108cc6466980f4d0394a1b3db80d36d940c7a6fad42e92a1b007809c | 18a9ab0c108cc6466980f4d0394a1b3db80d36d940c7a6fad42e92a1b007809c | no |
| src/modeling/ControlPointGeometrySource.js | 5f4b1445d327698e12428b3c6be16bb79de2eb1fb2653c737e69ae4f54fd64a4 | 5f4b1445d327698e12428b3c6be16bb79de2eb1fb2653c737e69ae4f54fd64a4 | e80981d336addf109821ed30dc1e8cf21f552d7851d50d39e0e8f12f5f8112b1 | e80981d336addf109821ed30dc1e8cf21f552d7851d50d39e0e8f12f5f8112b1 | no |
| src/storage/FolderDocumentStore.mjs | absent | absent | 00405e5baa2f152b2b0257a3a6746f1080fc38cc2b3529a6bf209e6431551615 | 00405e5baa2f152b2b0257a3a6746f1080fc38cc2b3529a6bf209e6431551615 | no |
| src/storage/LocalDocumentArchive.js | absent | absent | f66d864658cecac3bed536814a11e35b1c38b17a016a39d60929a9366926be48 | f66d864658cecac3bed536814a11e35b1c38b17a016a39d60929a9366926be48 | no |

## 54c9c35e1fd9ebe4ec9eca6c735bad5203c130e8d04c533001d3105ac92b0e90

Message: Complete mesh-only and empty folder round trips; retain legacy native archives and include storage source modules in standalone Git inventory

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/LOCAL_DOCUMENT_STORAGE.md | 90c08a97c34e055d7c6b2ffdf1fd8d5eb7a842f5b71f2073c48b9c0c96f614c0 | 90c08a97c34e055d7c6b2ffdf1fd8d5eb7a842f5b71f2073c48b9c0c96f614c0 | 65de8e7fb86dc1a5c3e88e7d1228c1b1808ce9dc9b16c9889eff3015431bd9a2 | 65de8e7fb86dc1a5c3e88e7d1228c1b1808ce9dc9b16c9889eff3015431bd9a2 | no |
| scripts/test-local-document-folder-browser.cjs | 64180b1855dcd4c13b3920001f7a4716b24a31fe1ff1ca1c76018bf33d301838 | 64180b1855dcd4c13b3920001f7a4716b24a31fe1ff1ca1c76018bf33d301838 | 2462c3383703a1b0e3cd9143ab667dfa2350bac63f7d9dc9eaf0f76ba0e5e80d | 2462c3383703a1b0e3cd9143ab667dfa2350bac63f7d9dc9eaf0f76ba0e5e80d | no |
| src/.gitignore | absent | absent | 2ff93eaaa8aa4be09b28d1d168ddbe6f5b2c4905f031b4a7f809a50762ab38e8 | 2ff93eaaa8aa4be09b28d1d168ddbe6f5b2c4905f031b4a7f809a50762ab38e8 | no |
| src/storage/LocalDocumentArchive.js | f66d864658cecac3bed536814a11e35b1c38b17a016a39d60929a9366926be48 | f66d864658cecac3bed536814a11e35b1c38b17a016a39d60929a9366926be48 | 3209ddfde225f4d4ee71930e901f61bada0fcb616c7772182db0be3af7eb372d | 3209ddfde225f4d4ee71930e901f61bada0fcb616c7772182db0be3af7eb372d | no |

## 96f00037256a52be496a9d9b9d0e9afd9cf73845441801335c39b8b5759b220b

Message: Route WASM strict/display meshing through NodeC on_brep.cpp ON_Brep_CreateMeshInternal; native DLL and browser worker/import/recovery tests passed; keep C++ sources private

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/nodec/NodeC.wasm | 6c4f7ee821eed51bd946482b14abe4be797b37ae9775bd6b4aabb526d93745ed | 6c4f7ee821eed51bd946482b14abe4be797b37ae9775bd6b4aabb526d93745ed | aa72de787cf3c3abe681b796abaca7a78e2841df3ab16768039c8cda09bb675f | aa72de787cf3c3abe681b796abaca7a78e2841df3ab16768039c8cda09bb675f | no |

## de4c427e5f041d6147d771d5b362463aef38ace67f999f6369186b2f96188a19

Message: Move adaptive curve sampling into existing on_curve.cpp; share native/WASM implementation and preserve preview ABI; record geometry module placement policy; native accuracy and WASM regressions passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| AGENTS.md | b34c920737af9e255af1a3fc57086176846256822792c93337eb6b6dd4b0e330 | b34c920737af9e255af1a3fc57086176846256822792c93337eb6b6dd4b0e330 | e11c1d8a144c5d94a190ee1669bb6177948d84de90f324b5b60c840770a549d6 | e11c1d8a144c5d94a190ee1669bb6177948d84de90f324b5b60c840770a549d6 | yes |
| public/nodec/NodeC.js | 92778a3cd6f962b4bc422246da6e7070f2f7d14e8a8839064eb481fd190999c3 | 92778a3cd6f962b4bc422246da6e7070f2f7d14e8a8839064eb481fd190999c3 | b6e119baa0b5932c4c39a5291d41fa6600500d5dbb566c844c7b0c8cc6273df2 | b6e119baa0b5932c4c39a5291d41fa6600500d5dbb566c844c7b0c8cc6273df2 | no |
| public/nodec/NodeC.wasm | aa72de787cf3c3abe681b796abaca7a78e2841df3ab16768039c8cda09bb675f | aa72de787cf3c3abe681b796abaca7a78e2841df3ab16768039c8cda09bb675f | 85eac3117aadf830a54a864880a05a3ac836c80563d43efca435d6d08b9c676f | 85eac3117aadf830a54a864880a05a3ac836c80563d43efca435d6d08b9c676f | no |

## f4cddc21267ec6f6859a6f162283a3cab70c924502e2bd9da364ef3e0d61571d

Message: Add seven loadable WASM node registration packages (630 definitions); SolveInstance pending; ABI and offline browser tests passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/FRONTEND_SYNC.md | 1278c93e22e9dbdbe53addd85f463adb6f79c358dc19141d13d27bc9d5d386dc | 1278c93e22e9dbdbe53addd85f463adb6f79c358dc19141d13d27bc9d5d386dc | 44a3b4871635ea1a18bfda48073db1909b7e769a147b4196a01f159ea26c439b | 44a3b4871635ea1a18bfda48073db1909b7e769a147b4196a01f159ea26c439b | no |
| docs/WASM_NODE_PACKAGES.md | absent | absent | ea079bccc9efe5be8d22a00c0405e0d49472b87523f622d17d29c77a774def25 | ea079bccc9efe5be8d22a00c0405e0d49472b87523f622d17d29c77a774def25 | no |
| public/editor/js/code.js | 2992bbfe8038ad1655ca1bc7f05d4cfb76f38c938ec63ca9d16b36e30cbc8a0e | 2992bbfe8038ad1655ca1bc7f05d4cfb76f38c938ec63ca9d16b36e30cbc8a0e | 8ba981b02ed72aefbe8fe3580888cb3b84a53d3e42ac2bcb556d6547c9a575a1 | 8ba981b02ed72aefbe8fe3580888cb3b84a53d3e42ac2bcb556d6547c9a575a1 | no |
| public/editor/src/pandaui-plugins.js | 5c4e9e4e094c2999d1cfbd6af2b13c1c9869468a900a80591e66ffe79479ec20 | 5c4e9e4e094c2999d1cfbd6af2b13c1c9869468a900a80591e66ffe79479ec20 | e01d109e5af865caed5b6592997d4faa8f754ed6e36a10ccf1faf60c99c2c176 | e01d109e5af865caed5b6592997d4faa8f754ed6e36a10ccf1faf60c99c2c176 | no |
| public/editor/src/pandaui-wasm-packages.js | absent | absent | bea85ed247d8b3bca841a12d45b9c5069792ebb42ddea97a3b988a08e022e2f3 | bea85ed247d8b3bca841a12d45b9c5069792ebb42ddea97a3b988a08e022e2f3 | no |
| public/nodec/NodePackage.worker.mjs | absent | absent | 692627f6a047ca90eaf1eb3fe83f19c59037c8d3723c0e9df174e348ede3dcab | 692627f6a047ca90eaf1eb3fe83f19c59037c8d3723c0e9df174e348ede3dcab | no |
| public/nodec/NodePackageLoader.mjs | absent | absent | 07e4861c3c91832feae2c0433a9ae004170bbb8ab1657479ebfecaf1be0af8f4 | 07e4861c3c91832feae2c0433a9ae004170bbb8ab1657479ebfecaf1be0af8f4 | no |
| public/nodec/NodePackageProtocol.mjs | absent | absent | 1ca4d07a70ce3c9af5a9ec1b98a5340ed96264469596caf316d4ae63ebf74670 | 1ca4d07a70ce3c9af5a9ec1b98a5340ed96264469596caf316d4ae63ebf74670 | no |
| public/nodec/packages/NOTICE.txt | absent | absent | 20890620265bdbc531704107ee654e0bdf64ca694047e9bb0efb49931cb67a68 | 20890620265bdbc531704107ee654e0bdf64ca694047e9bb0efb49931cb67a68 | no |
| public/nodec/packages/index.json | absent | absent | c5b7e663fd2260430f769a40d1308d4ea966e53a93f143d48a394235afc0b4ae | c5b7e663fd2260430f769a40d1308d4ea966e53a93f143d48a394235afc0b4ae | no |
| public/nodec/packages/nodecurvec/NodeCurveC.wasm | absent | absent | c03df3edc6d47fed94b00479870cff35b929f2cdf73e5038c94651b3d6145354 | c03df3edc6d47fed94b00479870cff35b929f2cdf73e5038c94651b3d6145354 | no |
| public/nodec/packages/nodecurvec/manifest.json | absent | absent | 70157aa78f9a31735e90dabc7ca38765d54ee39951715d83078cc7e28b9e7605 | 70157aa78f9a31735e90dabc7ca38765d54ee39951715d83078cc7e28b9e7605 | no |
| public/nodec/packages/nodemathc/NodeMathC.wasm | absent | absent | b88c93a987e3f2215f9a250fa1a11b2a1a3a721d93b0010abc2b2f679154c399 | b88c93a987e3f2215f9a250fa1a11b2a1a3a721d93b0010abc2b2f679154c399 | no |
| public/nodec/packages/nodemathc/manifest.json | absent | absent | 23a84189c3b0823700d26e4cb67da343ab44ee9c3e39e1a5c67e9c989d9927ef | 23a84189c3b0823700d26e4cb67da343ab44ee9c3e39e1a5c67e9c989d9927ef | no |
| public/nodec/packages/nodemeshc/NodeMeshC.wasm | absent | absent | 09747870cd1fcde7fd3e0069c1e01a221d01c7a03236e03ce40795e36f7a3363 | 09747870cd1fcde7fd3e0069c1e01a221d01c7a03236e03ce40795e36f7a3363 | no |
| public/nodec/packages/nodemeshc/manifest.json | absent | absent | 8a3cc36fbc71bce8367f62473af38413472ee26ee7533ab990db22967426f248 | 8a3cc36fbc71bce8367f62473af38413472ee26ee7533ab990db22967426f248 | no |
| public/nodec/packages/nodepointc/NodePointC.wasm | absent | absent | 6751de6332d77a317d6c0e0607c47c4e5c9692c395e4147789c570f94147743f | 6751de6332d77a317d6c0e0607c47c4e5c9692c395e4147789c570f94147743f | no |
| public/nodec/packages/nodepointc/manifest.json | absent | absent | 3795dc3b3a5c715966aa1363c655b63426d68ae625db999f9e05252a73800580 | 3795dc3b3a5c715966aa1363c655b63426d68ae625db999f9e05252a73800580 | no |
| public/nodec/packages/nodesurfacec/NodeSurfaceC.wasm | absent | absent | 94d0784dac5c249f24ab963b4b6daf1781ae8dd2dbfecdf4dd6f68b18088f738 | 94d0784dac5c249f24ab963b4b6daf1781ae8dd2dbfecdf4dd6f68b18088f738 | no |
| public/nodec/packages/nodesurfacec/manifest.json | absent | absent | 2b571d5e4b17a9457637a6781549ea30e94ff2d4b37526366b860fc4c625ccd7 | 2b571d5e4b17a9457637a6781549ea30e94ff2d4b37526366b860fc4c625ccd7 | no |
| public/nodec/packages/nodetrianglec/NodeTriangleC.wasm | absent | absent | 1a5b430778b10c741db90665f897a791901203355e59deaca6c54f87088c29f8 | 1a5b430778b10c741db90665f897a791901203355e59deaca6c54f87088c29f8 | no |
| public/nodec/packages/nodetrianglec/manifest.json | absent | absent | 4c6c3fc9b875c510e92e068c9aa2b65361ce0ae4747b97ca48ff9108df9dcb78 | 4c6c3fc9b875c510e92e068c9aa2b65361ce0ae4747b97ca48ff9108df9dcb78 | no |
| public/nodec/packages/nodexformc/NodeXformC.wasm | absent | absent | 6f2bdee1772cdc3b37be8833dc80ac7b0a76dd76b90e4c6a045ac291f95a78dd | 6f2bdee1772cdc3b37be8833dc80ac7b0a76dd76b90e4c6a045ac291f95a78dd | no |
| public/nodec/packages/nodexformc/manifest.json | absent | absent | c1df244de6adb69a3bf783466bf12331db88926fd75755351916006f18d720d3 | c1df244de6adb69a3bf783466bf12331db88926fd75755351916006f18d720d3 | no |
| scripts/sync-frontend-export.cjs | 9ba7dff3205f2f023c5512a313ab8f4a5cd107429b452178062cd1d5eefc8e73 | 9ba7dff3205f2f023c5512a313ab8f4a5cd107429b452178062cd1d5eefc8e73 | b8b6c1dfc038f82f0d74894b202a623bf5e708ea6dc57041109a1504cad2c746 | b8b6c1dfc038f82f0d74894b202a623bf5e708ea6dc57041109a1504cad2c746 | no |
| scripts/test-node-packages-browser.cjs | absent | absent | 5f0b11ef85950f3e9dfd26065ef68d01642439cbe2a000a491f4bf482fbe205b | 5f0b11ef85950f3e9dfd26065ef68d01642439cbe2a000a491f4bf482fbe205b | no |
| scripts/test-node-packages.cjs | absent | absent | 16ea98ddef52972d12d87e15db14e72be732ee9d96402b9c1183d5b9d3aa4df5 | 16ea98ddef52972d12d87e15db14e72be732ee9d96402b9c1183d5b9d3aa4df5 | no |

## adde20c86bc73631d2c4281f7d775a141a654cc91bce6e64f85e289634ee498d

Message: Record completed WASM package validation: both builds, source/export browser tests and release checks passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/WASM_NODE_PACKAGES.md | ea079bccc9efe5be8d22a00c0405e0d49472b87523f622d17d29c77a774def25 | ea079bccc9efe5be8d22a00c0405e0d49472b87523f622d17d29c77a774def25 | 29a90bd7812caeb09a6e6bd46c734c800772ab49c3d02b92a79852ea6c739ffb | 29a90bd7812caeb09a6e6bd46c734c800772ab49c3d02b92a79852ea6c739ffb | no |

## c23d7c6887acc7ea3586c1062cd9edb9840493e765a234e8569bba9783799d30

Message: Organize Add Node by functional categories, merge case variants, group WASM nodes and normalize search; runtime and browser regressions passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/WASM_NODE_PACKAGES.md | 29a90bd7812caeb09a6e6bd46c734c800772ab49c3d02b92a79852ea6c739ffb | 29a90bd7812caeb09a6e6bd46c734c800772ab49c3d02b92a79852ea6c739ffb | 48ad7bdbc4ae53902bb6351ee861e8694e07b209f354189b311e06afda1f73c0 | 48ad7bdbc4ae53902bb6351ee861e8694e07b209f354189b311e06afda1f73c0 | no |
| public/editor/src/PandaUI/GraphCanvas.js | b73741cf014539b964cfd032cb5de52bf376750a6e3a341f32af8d0e49417dae | b73741cf014539b964cfd032cb5de52bf376750a6e3a341f32af8d0e49417dae | 43ea297508179c1819d5a8eb27809169dbda98d07556b9699e606700fed225fb | 43ea297508179c1819d5a8eb27809169dbda98d07556b9699e606700fed225fb | no |
| scripts/test-editor-pandaui-runtime.js | da162abfa3d19643db86e4c54f9f927e20c767a6fd88cbee7705c2220a062a58 | da162abfa3d19643db86e4c54f9f927e20c767a6fd88cbee7705c2220a062a58 | 12af5c068562218dc176203d9f842751e7f2c43c1661d7f4b8594eed3c991472 | 12af5c068562218dc176203d9f842751e7f2c43c1661d7f4b8594eed3c991472 | no |
| scripts/test-node-packages-browser.cjs | 5f0b11ef85950f3e9dfd26065ef68d01642439cbe2a000a491f4bf482fbe205b | 5f0b11ef85950f3e9dfd26065ef68d01642439cbe2a000a491f4bf482fbe205b | 7cbb07803e34391c18cf7f8d49c855412fa5987ce0e8561a0730eb924951ad36 | 7cbb07803e34391c18cf7f8d49c855412fa5987ce0e8561a0730eb924951ad36 | no |

## 43840e5f6c03ff72198732a5f68dc5eea7ec364d28caa359a4892690cecea626

Message: Respect standalone robot-plugin exclusion in node menu browser validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| scripts/test-node-packages-browser.cjs | 7cbb07803e34391c18cf7f8d49c855412fa5987ce0e8561a0730eb924951ad36 | 7cbb07803e34391c18cf7f8d49c855412fa5987ce0e8561a0730eb924951ad36 | 5f5c7ad184855b740bff0cd113b3faf936d01e5605e52c3d4c975161c5a0540f | 5f5c7ad184855b740bff0cd113b3faf936d01e5605e52c3d4c975161c5a0540f | no |

## a49e86df1b9fd9146f411dd9f36b6825a39da4e046aaaff231619e8b662b97f9

Message: Bound nonconverging Brep display recovery, accelerate UV predicates and adjacency, show primary meshes before retries with face progress; native/WASM UV and mesher regressions passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/BREP_MESHING.md | absent | absent | da01156e567300be7fb662d63aff4bc89d548eea3bc2d5e25932c135e6d4d15d | da01156e567300be7fb662d63aff4bc89d548eea3bc2d5e25932c135e6d4d15d | no |
| docs/FRONTEND_SYNC.md | 44a3b4871635ea1a18bfda48073db1909b7e769a147b4196a01f159ea26c439b | 44a3b4871635ea1a18bfda48073db1909b7e769a147b4196a01f159ea26c439b | 6ca819de10fb516269f5e1364ad78d61f5502383a485e1e52f2503f89117c06a | 6ca819de10fb516269f5e1364ad78d61f5502383a485e1e52f2503f89117c06a | no |
| public/nodec/BrepDisplayMeshing.js | f46d439e43739b5a597d619e5b95cb53de86c44c69adec93e46282f2a885a39c | f46d439e43739b5a597d619e5b95cb53de86c44c69adec93e46282f2a885a39c | 4fd5b579e093fb7e4886d510a0396974393daabf57c01006074993fc655dc3eb | 4fd5b579e093fb7e4886d510a0396974393daabf57c01006074993fc655dc3eb | no |
| public/nodec/NodeC.js | b6e119baa0b5932c4c39a5291d41fa6600500d5dbb566c844c7b0c8cc6273df2 | b6e119baa0b5932c4c39a5291d41fa6600500d5dbb566c844c7b0c8cc6273df2 | c69b7d76721815ece6be51012b8b3ea95ad52789dcf095d2b35a730d05e4ea58 | c69b7d76721815ece6be51012b8b3ea95ad52789dcf095d2b35a730d05e4ea58 | no |
| public/nodec/NodeC.wasm | 85eac3117aadf830a54a864880a05a3ac836c80563d43efca435d6d08b9c676f | 85eac3117aadf830a54a864880a05a3ac836c80563d43efca435d6d08b9c676f | a2b72d7fc7c389287393dc6d788f50a7f42264e77e91d2f1eb67bde4f7ff848e | a2b72d7fc7c389287393dc6d788f50a7f42264e77e91d2f1eb67bde4f7ff848e | no |
| scripts/sync-frontend-export.cjs | b8b6c1dfc038f82f0d74894b202a623bf5e708ea6dc57041109a1504cad2c746 | b8b6c1dfc038f82f0d74894b202a623bf5e708ea6dc57041109a1504cad2c746 | 386aaa8791485da71d0444767d7d1409a6db6029b662952c281478e030943ba4 | 386aaa8791485da71d0444767d7d1409a6db6029b662952c281478e030943ba4 | no |
| scripts/test-mesh-worker-pool.js | absent | absent | 38755b8f8775cad4fc21a488ef077adb981154b4acf108ad0a97787c9b41acd8 | 38755b8f8775cad4fc21a488ef077adb981154b4acf108ad0a97787c9b41acd8 | no |
| src/composables/useModelImport.js | 1600610a1cfb2749aa43ecbc0be1d1681a6bc4b96fc2f194fcc5a4f54db1b470 | 1600610a1cfb2749aa43ecbc0be1d1681a6bc4b96fc2f194fcc5a4f54db1b470 | 13dbd24a020f575c3121450aad3196f91e48dd720f43e0f5f8480b3e3f14178f | 13dbd24a020f575c3121450aad3196f91e48dd720f43e0f5f8480b3e3f14178f | no |
| src/import/BrepMesh.worker.js | d004e6b24985d36f5af5d16d1c6bdb6a061fa0db5accfa329d6b1e1eec498447 | d004e6b24985d36f5af5d16d1c6bdb6a061fa0db5accfa329d6b1e1eec498447 | db3419f32bf086978410ee9893ea2ffaf65981e75f2e6c7aa8b2079d68bfb021 | db3419f32bf086978410ee9893ea2ffaf65981e75f2e6c7aa8b2079d68bfb021 | no |
| src/import/ImportMeshFeed.js | 1faf2a0e2dfae8b1df64af6f56ea8a8a520d966c79910d647fe50cba29d71e03 | 1faf2a0e2dfae8b1df64af6f56ea8a8a520d966c79910d647fe50cba29d71e03 | 7ea69fdf532c9ed78c6288e129c20decd994bf4788bf55a34238e082d02be1e0 | 7ea69fdf532c9ed78c6288e129c20decd994bf4788bf55a34238e082d02be1e0 | no |
| src/import/LocalImportClient.js | c8495a0b4f7d98f4d24cce46edb294df07a69f58a1212ef08bc438f3c9b99110 | c8495a0b4f7d98f4d24cce46edb294df07a69f58a1212ef08bc438f3c9b99110 | 6fdf7625609da187ee7e06944c22f574da7f00c29f5498fbee7e6d525d28ec96 | 6fdf7625609da187ee7e06944c22f574da7f00c29f5498fbee7e6d525d28ec96 | no |
| src/import/MeshWorkerPool.js | 8a0b9f46c96a2131d021f65d08eb8412d52ea23097b82a6b9e9336daa82eda10 | 8a0b9f46c96a2131d021f65d08eb8412d52ea23097b82a6b9e9336daa82eda10 | 4366c1d10095f32df41c30771b35a14ae3493b6d09b8ea1fb2457b5d27484a29 | 4366c1d10095f32df41c30771b35a14ae3493b6d09b8ea1fb2457b5d27484a29 | no |
| src/import/prepareBrepImportRecord.js | f8631ffe75eb1ff913d72afcc786f675417e5fcbd0ce1052798c2179c3c4ca0e | f8631ffe75eb1ff913d72afcc786f675417e5fcbd0ce1052798c2179c3c4ca0e | d61b10ced3b83245917603f09ab7f2f7bb751af530ae0a3f246ea188ed23e674 | d61b10ced3b83245917603f09ab7f2f7bb751af530ae0a3f246ea188ed23e674 | no |
| src/import/remeshLocalDocument.js | 18a9ab0c108cc6466980f4d0394a1b3db80d36d940c7a6fad42e92a1b007809c | 18a9ab0c108cc6466980f4d0394a1b3db80d36d940c7a6fad42e92a1b007809c | eb07279988079c29f94c3fd726142f49bf8590601c653b8c3ba653cd42a98b62 | eb07279988079c29f94c3fd726142f49bf8590601c653b8c3ba653cd42a98b62 | no |

## 881a40e85bef3cae2dda774ae1d73969c22cffeeb1e7ae67ef7b0ffe8b022660

Message: Stop stagnant Brep boundary recovery and flush primary mesh previews

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/BREP_MESHING.md | da01156e567300be7fb662d63aff4bc89d548eea3bc2d5e25932c135e6d4d15d | da01156e567300be7fb662d63aff4bc89d548eea3bc2d5e25932c135e6d4d15d | 580c783046207c779c17c9178c8dcdb4832640c40351e9c05e7d6d5ea92b5923 | 580c783046207c779c17c9178c8dcdb4832640c40351e9c05e7d6d5ea92b5923 | no |
| public/nodec/NodeC.js | c69b7d76721815ece6be51012b8b3ea95ad52789dcf095d2b35a730d05e4ea58 | c69b7d76721815ece6be51012b8b3ea95ad52789dcf095d2b35a730d05e4ea58 | 7c8c997d71ef93badad490c740f2158023256087e43603199961437784e8f602 | 7c8c997d71ef93badad490c740f2158023256087e43603199961437784e8f602 | no |
| public/nodec/NodeC.wasm | a2b72d7fc7c389287393dc6d788f50a7f42264e77e91d2f1eb67bde4f7ff848e | a2b72d7fc7c389287393dc6d788f50a7f42264e77e91d2f1eb67bde4f7ff848e | 24d5ad16eb9aad79583e9e0448145008e0e2d71a43cb1fbdba0fe9abc4ecb7b7 | 24d5ad16eb9aad79583e9e0448145008e0e2d71a43cb1fbdba0fe9abc4ecb7b7 | no |
| src/PandaUIApp.js | f30914547c8990895e00685d70a464f498ef0872fcde2d21eb91e328b91e980d | f30914547c8990895e00685d70a464f498ef0872fcde2d21eb91e328b91e980d | 833fe8acec2b6a8d780dd5cf3c10d63f4865d535d6071eccf6d202ed68c6248d | 833fe8acec2b6a8d780dd5cf3c10d63f4865d535d6071eccf6d202ed68c6248d | no |
| src/import/remeshLocalDocument.js | eb07279988079c29f94c3fd726142f49bf8590601c653b8c3ba653cd42a98b62 | eb07279988079c29f94c3fd726142f49bf8590601c653b8c3ba653cd42a98b62 | 36ba1ed7fdd93c39fc46fbec51fa596f7004b546df8a9d57edd9919e366d3682 | 36ba1ed7fdd93c39fc46fbec51fa596f7004b546df8a9d57edd9919e366d3682 | no |

## e48fbfaee911d76caee02f632c49c970f7f763b2a248e57da05357fc57e2f86e

Message: Avoid unused surface normals during mesh refinement without changing mesh buffers

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/BREP_MESHING.md | 580c783046207c779c17c9178c8dcdb4832640c40351e9c05e7d6d5ea92b5923 | 580c783046207c779c17c9178c8dcdb4832640c40351e9c05e7d6d5ea92b5923 | 69624ee446765057653c6cf05b4cc88eff5eb53aa10729251c4be71cb4186503 | 69624ee446765057653c6cf05b4cc88eff5eb53aa10729251c4be71cb4186503 | no |
| public/nodec/NodeC.wasm | 24d5ad16eb9aad79583e9e0448145008e0e2d71a43cb1fbdba0fe9abc4ecb7b7 | 24d5ad16eb9aad79583e9e0448145008e0e2d71a43cb1fbdba0fe9abc4ecb7b7 | 6a51edb472e690d70eeb50c975be11446641eee8d1c669a4b71d463e0bf38b07 | 6a51edb472e690d70eeb50c975be11446641eee8d1c669a4b71d463e0bf38b07 | no |

## eca1e53cc2fab58e977e1d45fa376f355bb277a88f02977525472f7f91acccf0

Message: Stop oscillating Brep recovery against the best prior surface residual

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/BREP_MESHING.md | 69624ee446765057653c6cf05b4cc88eff5eb53aa10729251c4be71cb4186503 | 69624ee446765057653c6cf05b4cc88eff5eb53aa10729251c4be71cb4186503 | 3a07780f8173b9b52c79c878d66073a0d3a286b1a24eae015a7e53f75e4cffa4 | 3a07780f8173b9b52c79c878d66073a0d3a286b1a24eae015a7e53f75e4cffa4 | no |
| public/nodec/NodeC.wasm | 6a51edb472e690d70eeb50c975be11446641eee8d1c669a4b71d463e0bf38b07 | 6a51edb472e690d70eeb50c975be11446641eee8d1c669a4b71d463e0bf38b07 | 1546892536492dcb23723be59146d82b8bcd7ece8cbc34ea36840c65dab67ac1 | 1546892536492dcb23723be59146d82b8bcd7ece8cbc34ea36840c65dab67ac1 | no |

## b8037972efe41987161bb8ada44591fdbc96f1c6d46683835e2eaead4903b291

Message: Add hierarchical document tree visibility, isolation and locking actions

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/DisplayPipeline.js | 3046b10e415bde5e36f0028cbfa570bf9221ecf783543e3de3e70eeb3b6c63a8 | 3046b10e415bde5e36f0028cbfa570bf9221ecf783543e3de3e70eeb3b6c63a8 | 031b12b531897da690e6fad94050259c331c687b18c4d9c5f4ef2bd807907688 | 031b12b531897da690e6fad94050259c331c687b18c4d9c5f4ef2bd807907688 | no |
| src/DocumentHierarchy.js | c05d1d158f32b5620012e82576f90b3bc4f45fe166f8a66a5112f4b205622bf9 | c05d1d158f32b5620012e82576f90b3bc4f45fe166f8a66a5112f4b205622bf9 | 4abfa038c5b19f0c39e733e840caaf615b36f24ea4865552d292daee514235e2 | 4abfa038c5b19f0c39e733e840caaf615b36f24ea4865552d292daee514235e2 | no |
| src/GeometryDocumentViewState.js | 14c0fb4e293ed3eb512b3b6bc8695ff9dd8eea6d236112f1d3dd24e8a9296eea | 14c0fb4e293ed3eb512b3b6bc8695ff9dd8eea6d236112f1d3dd24e8a9296eea | 46f52150d613e0a8912be76b87e3f5ff41b9d407879632f48fabc2b6b60a1bb9 | 46f52150d613e0a8912be76b87e3f5ff41b9d407879632f48fabc2b6b60a1bb9 | no |
| src/PandaUIApp.js | 833fe8acec2b6a8d780dd5cf3c10d63f4865d535d6071eccf6d202ed68c6248d | 833fe8acec2b6a8d780dd5cf3c10d63f4865d535d6071eccf6d202ed68c6248d | 6480d57e82cb4c6ca68703d2b34a5f8e06d58fade69dfa470ee23d10cc4de6f9 | 6480d57e82cb4c6ca68703d2b34a5f8e06d58fade69dfa470ee23d10cc4de6f9 | no |
| src/PandaUIDoc.js | b631b089d8971ad626133d524c5bd610a5a7a8b1bda8d513135c388a03c03a6d | b631b089d8971ad626133d524c5bd610a5a7a8b1bda8d513135c388a03c03a6d | 41cf344b71e3dfa54d1384a43512d10a8c5db03af60d164f65df0f2bd3c449a1 | 41cf344b71e3dfa54d1384a43512d10a8c5db03af60d164f65df0f2bd3c449a1 | no |
| src/collaboration/SceneDisplayPacket.js | 14600b08910fcb7ea67235bbe05a2b1b57eb88ecbe6bd3f4621619ec94f267f0 | 14600b08910fcb7ea67235bbe05a2b1b57eb88ecbe6bd3f4621619ec94f267f0 | ea31219f3178c390e6d83a4db30d95f66a9831e4c080024735c08f8d7662651e | ea31219f3178c390e6d83a4db30d95f66a9831e4c080024735c08f8d7662651e | no |
| src/components/GeometryDocumentTree.vue | d97ff7f3415d581b2fb5c69712b0bba78a141d5ce1c0d54e41847f37cf43fd58 | d97ff7f3415d581b2fb5c69712b0bba78a141d5ce1c0d54e41847f37cf43fd58 | 826f471a242a32d655b879e7a91506d045f9ee0faf310ef5f5e7d04f7526ae58 | 826f471a242a32d655b879e7a91506d045f9ee0faf310ef5f5e7d04f7526ae58 | no |
| src/display/GraphPreviewRegistry.js | 7330d715bd82f7d0b71d9744ea8e32b4b8d867b95af7f41486da6072e1b50cb3 | 7330d715bd82f7d0b71d9744ea8e32b4b8d867b95af7f41486da6072e1b50cb3 | 0023309a4e4bb27d07c160d1a00deeccdc11496e1d19bf938e86e015a92c434f | 0023309a4e4bb27d07c160d1a00deeccdc11496e1d19bf938e86e015a92c434f | no |
| src/display/SceneInteraction.js | 3ed8990e9dccfec0b949d22763a72fa95778b2ad2aac5af32ec791f7744820f1 | 3ed8990e9dccfec0b949d22763a72fa95778b2ad2aac5af32ec791f7744820f1 | 7efd34b8169fba545d5f305162cbf85126f3f2dd8bce01289636f018b78f5a0b | 7efd34b8169fba545d5f305162cbf85126f3f2dd8bce01289636f018b78f5a0b | no |
| src/display/SceneSelection.js | 87228da057a6e78e2768c659f8cea452eb3b32b6a34e7c0d34ec48d89e9ebc5b | 87228da057a6e78e2768c659f8cea452eb3b32b6a34e7c0d34ec48d89e9ebc5b | 9d9708c267a14563a9b76818fc83264fcf24fee233111dca476970afb9d02939 | 9d9708c267a14563a9b76818fc83264fcf24fee233111dca476970afb9d02939 | no |
| src/display/SceneVisibility.js | fa933aa10d6602e38619199fec271ca20eeb90218a073bf89134fa4725b2c2a4 | fa933aa10d6602e38619199fec271ca20eeb90218a073bf89134fa4725b2c2a4 | 3b00cb19b18799561ad975344eccdd0dc1b3f78bf8e736c1a9d7b28d7745f44c | 3b00cb19b18799561ad975344eccdd0dc1b3f78bf8e736c1a9d7b28d7745f44c | no |
| src/operations/WorkspaceOperations.js | 5920b20683e94eea0283e4047f4370034f465677a8a4d94d2a2a70c1c53e257b | 5920b20683e94eea0283e4047f4370034f465677a8a4d94d2a2a70c1c53e257b | 7bfc1c838faa1d296cc468c6675e9678d162dc3ad8e6e8e2c7df139546b0ea8d | 7bfc1c838faa1d296cc468c6675e9678d162dc3ad8e6e8e2c7df139546b0ea8d | no |

## bdfc7c6f3b8f046e24672255b20c2dd3bc82c5de61161e75d23788e868484def

Message: Collapse nodes for scene activation and expand them for editor activation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/editor/src/PandaUI/GraphCanvas.js | 43ea297508179c1819d5a8eb27809169dbda98d07556b9699e606700fed225fb | 43ea297508179c1819d5a8eb27809169dbda98d07556b9699e606700fed225fb | 8e2660b1f00501754cee9e54e61c33d1968cd5fac6c02675c20ad57012075e13 | 8e2660b1f00501754cee9e54e61c33d1968cd5fac6c02675c20ad57012075e13 | no |

## 4662e4d1b879d427fe6b7f34646c89e67b006732570c0e34fa704023b2344e67

Message: Restore imported line and point visibility after document hide/show

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/GeometryDocumentViewState.js | 46f52150d613e0a8912be76b87e3f5ff41b9d407879632f48fabc2b6b60a1bb9 | 46f52150d613e0a8912be76b87e3f5ff41b9d407879632f48fabc2b6b60a1bb9 | 4fa7ec5605bf40263b25b1d60e3c312b1b3b9efbcd3f42d675a5cfe7738269b6 | 4fa7ec5605bf40263b25b1d60e3c312b1b3b9efbcd3f42d675a5cfe7738269b6 | no |

## 6db418cb12687ab6649a800c85e034b2a8e7233b094b4b9f620864f1d5b0f57c

Message: Recompute scene object pick outputs and downstream nodes after viewport replies

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/editor/plugins/TTransform.js | 6815a2f476100cc84e9a5a4582f01b10bb3309f6ad7989f0744e2193c423a4c0 | 6815a2f476100cc84e9a5a4582f01b10bb3309f6ad7989f0744e2193c423a4c0 | 4c5f34dd521c53b153a70359b94893907c3cf06a873ba321720f3fdd71a4255b | 4c5f34dd521c53b153a70359b94893907c3cf06a873ba321720f3fdd71a4255b | no |

## b8f617dbc8be7350c12cc3647dbbedc0cdd49509de8e002b35e800da7f0057a9

Message: Show selected object name on the viewport pick button

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/editor/plugins/TTransform.js | 4c5f34dd521c53b153a70359b94893907c3cf06a873ba321720f3fdd71a4255b | 4c5f34dd521c53b153a70359b94893907c3cf06a873ba321720f3fdd71a4255b | 8c9288743dae9887e3f9923ea3a44c06674a3a89ca940d5d977d00d380ebcb82 | 8c9288743dae9887e3f9923ea3a44c06674a3a89ca940d5d977d00d380ebcb82 | no |

## 548d8f81e4428d0523c8fda9a9ef23effeec12379ac2ad016b590dfd907147e6

Message: Add render-only document save and import

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/PandaUIApp.js | 6480d57e82cb4c6ca68703d2b34a5f8e06d58fade69dfa470ee23d10cc4de6f9 | 6480d57e82cb4c6ca68703d2b34a5f8e06d58fade69dfa470ee23d10cc4de6f9 | 13116114626daec92d192fff589fa025509ab51549f0dee0a997d210b17de6c9 | 13116114626daec92d192fff589fa025509ab51549f0dee0a997d210b17de6c9 | no |
| src/components/SceneDocumentsPanel.vue | cb491e289870b25f5826a39fd873713b63212fb3c45354392e2f249babb337ce | cb491e289870b25f5826a39fd873713b63212fb3c45354392e2f249babb337ce | d26b2d3058de13c4d3f26a0e6742e0c4375dda7470295bf75b634796a0b4153a | d26b2d3058de13c4d3f26a0e6742e0c4375dda7470295bf75b634796a0b4153a | no |
| src/storage/LocalDocumentArchive.js | 3209ddfde225f4d4ee71930e901f61bada0fcb616c7772182db0be3af7eb372d | 3209ddfde225f4d4ee71930e901f61bada0fcb616c7772182db0be3af7eb372d | 75e9a1fbffbb03b22c15860dfc215c0b2bb35bae62edd6ac7f0027be64517ed1 | 75e9a1fbffbb03b22c15860dfc215c0b2bb35bae62edd6ac7f0027be64517ed1 | no |

## 172db000271339a856c2caebb7aeb1bd74152d008c393b2ea835d7e3f7f0c740

Message: Add default 8-sample idle raster AA, reuse render resources, and keep material choice independent of object selection. Validated GPU, node and Preview browser regressions; development test scripts remain source-only.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/editor/plugins/Material_Nodes.js | 43f1b6f382d1649c426254abd00aa28dddc6e7f06de26ab338f66d01d72d350a | 43f1b6f382d1649c426254abd00aa28dddc6e7f06de26ab338f66d01d72d350a | 9d0eff76fa3c8440e63da81d7699c76db93a17468f64e047105b0c3223434198 | 9d0eff76fa3c8440e63da81d7699c76db93a17468f64e047105b0c3223434198 | no |
| public/editor/plugins/Render_Nodes.js | 0cb85478678ba53db1c6d35e3ff0f25bb8a8d508de55482ef45d3ba45a7d10e4 | 0cb85478678ba53db1c6d35e3ff0f25bb8a8d508de55482ef45d3ba45a7d10e4 | b6111c2abc01cdb3138cca656c05c1d5a331657b01ca4c41eff2637c32b20fd9 | b6111c2abc01cdb3138cca656c05c1d5a331657b01ca4c41eff2637c32b20fd9 | no |
| src/PandaUIApp.js | 13116114626daec92d192fff589fa025509ab51549f0dee0a997d210b17de6c9 | 13116114626daec92d192fff589fa025509ab51549f0dee0a997d210b17de6c9 | 9bbd5dcfeb9d12aaa73e0846d81de3f481df245559e1d86c2bfdc6f245777a04 | 9bbd5dcfeb9d12aaa73e0846d81de3f481df245559e1d86c2bfdc6f245777a04 | no |
| src/composables/useEditorBridge.js | f2c978224183d3dd9b323a6d91210463b5b0eda068da1f7086568e6e5fdefb74 | f2c978224183d3dd9b323a6d91210463b5b0eda068da1f7086568e6e5fdefb74 | c31bc77d7c9a89a9a0d23d2ce8a1af0f4fb9d17a585f3429b67cd35e1aedbd22 | c31bc77d7c9a89a9a0d23d2ce8a1af0f4fb9d17a585f3429b67cd35e1aedbd22 | no |
| src/display/SceneSelection.js | 9d9708c267a14563a9b76818fc83264fcf24fee233111dca476970afb9d02939 | 9d9708c267a14563a9b76818fc83264fcf24fee233111dca476970afb9d02939 | 7cf45b1f90233677aa6c54d3f7c34641345c791b34c9525d6967fe83da4c540b | 7cf45b1f90233677aa6c54d3f7c34641345c791b34c9525d6967fe83da4c540b | no |
| src/render/RasterAccumulationPass.js | absent | absent | 81e9eb8378c0804c15634abc20ad863f314c0d47bf6e6471407db740669d1b40 | 81e9eb8378c0804c15634abc20ad863f314c0d47bf6e6471407db740669d1b40 | no |
| src/render/RasterRenderer.js | bbb92b6a872ba449724ac1303c9850e0be19846f2f677ca52c985cd4ac456cc7 | bbb92b6a872ba449724ac1303c9850e0be19846f2f677ca52c985cd4ac456cc7 | 970f6c34757f1e465bf04a553b90a2830c16ec761e43f17b2a6013dec9e7b661 | 970f6c34757f1e465bf04a553b90a2830c16ec761e43f17b2a6013dec9e7b661 | no |
| src/render/RenderConfiguration.js | a2e3cd79dc0fc3f1db2939e56ee0287a3cc50a4fe5376d296b60d317a44002f9 | a2e3cd79dc0fc3f1db2939e56ee0287a3cc50a4fe5376d296b60d317a44002f9 | 531ef68650f204a17e061bede30b837205d2fa3e8b5eb2249db46b4eeadbef18 | 531ef68650f204a17e061bede30b837205d2fa3e8b5eb2249db46b4eeadbef18 | no |
| src/render/RenderEngine.js | d9d7de99adfe782772df5e3446c725f0ccb0487dd6abc7079e95d00366f68a93 | d9d7de99adfe782772df5e3446c725f0ccb0487dd6abc7079e95d00366f68a93 | 2e5cf889409017c7ce9a9e26de5c46c619a2871b54f0c72dc6197b1b5e311edb | 2e5cf889409017c7ce9a9e26de5c46c619a2871b54f0c72dc6197b1b5e311edb | no |
| src/render/RenderResources.md | c0890070962bef074f1848a915c1357c8bd6bca0a0ba1900b4ee9904301ce04b | c0890070962bef074f1848a915c1357c8bd6bca0a0ba1900b4ee9904301ce04b | ae2bf05e3b938c0ce5b89963a889b9af3ea9ebbe8a76de086cb5bc9d8e48e28f | ae2bf05e3b938c0ce5b89963a889b9af3ea9ebbe8a76de086cb5bc9d8e48e28f | no |

## 01379ac4a4253375cea8b126c016debf6ac8bce65dd592ac7ef4bab4cb9d5297

Message: Guard accumulation cleanup when WebGL is unavailable; prior shared AA/selection release validation passed.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/RenderEngine.js | 2e5cf889409017c7ce9a9e26de5c46c619a2871b54f0c72dc6197b1b5e311edb | 2e5cf889409017c7ce9a9e26de5c46c619a2871b54f0c72dc6197b1b5e311edb | 1ec9a6b439cfce635224ee37ad5f735b472240e4db2282135ae0a08a0410734e | 1ec9a6b439cfce635224ee37ad5f735b472240e4db2282135ae0a08a0410734e | no |

## 37fc92e7677b6625a4e69288f6b767b747f903dc394e23cd36f26c04f0b27091

Message: Persist required render material libraries and portable HDR/texture inputs; retain render save targets and restore renderer state. Folder, codec, material editor and browser save/reopen regressions pass; development test scripts stay in their source projects.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/LOCAL_DOCUMENT_STORAGE.md | 65de8e7fb86dc1a5c3e88e7d1228c1b1808ce9dc9b16c9889eff3015431bd9a2 | 65de8e7fb86dc1a5c3e88e7d1228c1b1808ce9dc9b16c9889eff3015431bd9a2 | 94d1004b3fd965309c6800b79fe1540f5d444c7d0978d85d785fcf29b7c23cba | 94d1004b3fd965309c6800b79fe1540f5d444c7d0978d85d785fcf29b7c23cba | no |
| src/PandaUIApp.js | 9bbd5dcfeb9d12aaa73e0846d81de3f481df245559e1d86c2bfdc6f245777a04 | 9bbd5dcfeb9d12aaa73e0846d81de3f481df245559e1d86c2bfdc6f245777a04 | 07dffc7a44a67f2c3d67a33efc3a10fe4a8e0dd7a3bd67be4941efa3b3857782 | 07dffc7a44a67f2c3d67a33efc3a10fe4a8e0dd7a3bd67be4941efa3b3857782 | no |
| src/collaboration/SceneDisplayPacket.js | ea31219f3178c390e6d83a4db30d95f66a9831e4c080024735c08f8d7662651e | ea31219f3178c390e6d83a4db30d95f66a9831e4c080024735c08f8d7662651e | f103aef828466620af37e646e58fc51958cdab4f468c38b1b6a2589daf033674 | f103aef828466620af37e646e58fc51958cdab4f468c38b1b6a2589daf033674 | no |
| src/storage/LocalDocumentArchive.js | 75e9a1fbffbb03b22c15860dfc215c0b2bb35bae62edd6ac7f0027be64517ed1 | 75e9a1fbffbb03b22c15860dfc215c0b2bb35bae62edd6ac7f0027be64517ed1 | 87beb1af63e0d396def927243768b768422fd1e917a96267feb758b3e4ed0de6 | 87beb1af63e0d396def927243768b768422fd1e917a96267feb758b3e4ed0de6 | no |

## 0854fc5fac70a7f9d8174026a295db46162c43ab8af8c43ac792c4e64489c54a

Message: Enable checksum-verified LAN HTTP archive loading with cooperative SHA-256 fallback; native/fallback vectors and storage transaction regressions pass.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/LOCAL_DOCUMENT_STORAGE.md | 94d1004b3fd965309c6800b79fe1540f5d444c7d0978d85d785fcf29b7c23cba | 94d1004b3fd965309c6800b79fe1540f5d444c7d0978d85d785fcf29b7c23cba | c40928d3bbeea9611066ee668cca8bdcaeaae40364348ff87be3c422a5fce468 | c40928d3bbeea9611066ee668cca8bdcaeaae40364348ff87be3c422a5fce468 | no |
| scripts/test-folder-document-store.cjs | 01640dc5c0b6b8e673c9c2e9dd7173ecb07fcdf015635e814e32925d230b54f8 | 01640dc5c0b6b8e673c9c2e9dd7173ecb07fcdf015635e814e32925d230b54f8 | eee97e4a7d3258a0d281e0ab5b2052e5e366432efe8cc4a7e95e104a5e292f45 | eee97e4a7d3258a0d281e0ab5b2052e5e366432efe8cc4a7e95e104a5e292f45 | no |
| src/storage/FolderDocumentStore.mjs | 00405e5baa2f152b2b0257a3a6746f1080fc38cc2b3529a6bf209e6431551615 | 00405e5baa2f152b2b0257a3a6746f1080fc38cc2b3529a6bf209e6431551615 | 60e6fdfb3e1916b4fb9cd5f3a2106b71215507de7e7d631be9cf09ef255d3ba9 | 60e6fdfb3e1916b4fb9cd5f3a2106b71215507de7e7d631be9cf09ef255d3ba9 | no |
| src/storage/sha256.mjs | absent | absent | 7a00cd7e370c54ff05b90bfa000762a3d706149fb1f4baabbd3ef7a2e1b388d9 | 7a00cd7e370c54ff05b90bfa000762a3d706149fb1f4baabbd3ef7a2e1b388d9 | no |

## 315c88dae8ba4d7a3b4aa61f9bc9efc64e2133c39b29518520c4860403db8bdc

Message: Add selection-preserving viewport navigation API for Preview orbit, pan and zoom controls; real Edge mouse/touch/keyboard tests pass.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/DisplayPipeline.js | 031b12b531897da690e6fad94050259c331c687b18c4d9c5f4ef2bd807907688 | 031b12b531897da690e6fad94050259c331c687b18c4d9c5f4ef2bd807907688 | 68c2c5b852bd0e6d2fa5408a2430191588e42a3645a80b971a7ae8d27c43b6d6 | 68c2c5b852bd0e6d2fa5408a2430191588e42a3645a80b971a7ae8d27c43b6d6 | no |
| src/display/VIEW_NAVIGATION.md | absent | absent | 998257a1b6001a03bfd933de26301f8fa456905663ae17eaa6ae4e08d04f87d3 | 998257a1b6001a03bfd933de26301f8fa456905663ae17eaa6ae4e08d04f87d3 | no |

## 598639e36223cfb0e9317c922925dbc42f6f36f45ed52b69d62f2a8993a2bcd2

Message: Document Preview persistent trackpad navigation and verified wheel input behavior

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/display/VIEW_NAVIGATION.md | 998257a1b6001a03bfd933de26301f8fa456905663ae17eaa6ae4e08d04f87d3 | 998257a1b6001a03bfd933de26301f8fa456905663ae17eaa6ae4e08d04f87d3 | 59d2166aa551c1c007ab3acdafe028619b406a8e6e1a61c5f1e7a63cb174e679 | 59d2166aa551c1c007ab3acdafe028619b406a8e6e1a61c5f1e7a63cb174e679 | no |

## 04af9468980ac310293cbdc5f7bafe589ac038edad33ffa782d199911088f2f9

Message: Add automotive studio lighting, cached rough floor reflections, scale-aware bilateral AO and shadow filtering; WebGL pixels and resource lifetime verified

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/editor/plugins/Render_Nodes.js | b6111c2abc01cdb3138cca656c05c1d5a331657b01ca4c41eff2637c32b20fd9 | b6111c2abc01cdb3138cca656c05c1d5a331657b01ca4c41eff2637c32b20fd9 | f018aed8da984a99e2c08106939ce9dd8b0a859ac92de33c47074581c7841b3b | f018aed8da984a99e2c08106939ce9dd8b0a859ac92de33c47074581c7841b3b | no |
| src/render/RasterRenderer.js | 970f6c34757f1e465bf04a553b90a2830c16ec761e43f17b2a6013dec9e7b661 | 970f6c34757f1e465bf04a553b90a2830c16ec761e43f17b2a6013dec9e7b661 | ab66d91546830cb5372f503fb21ea15425991567170fada2feaab944aff54bcd | ab66d91546830cb5372f503fb21ea15425991567170fada2feaab944aff54bcd | no |
| src/render/RasterSSAOPass.js | 36982b293a4305d6899ac5d229be282345fd2bed41dda43dd5d641efb2811b43 | 36982b293a4305d6899ac5d229be282345fd2bed41dda43dd5d641efb2811b43 | c81578d9b9d6cbf6ce1d46c3a76483349b732d5bcb6309c69e945f95b5977bf8 | c81578d9b9d6cbf6ce1d46c3a76483349b732d5bcb6309c69e945f95b5977bf8 | no |
| src/render/RenderConfiguration.js | 531ef68650f204a17e061bede30b837205d2fa3e8b5eb2249db46b4eeadbef18 | 531ef68650f204a17e061bede30b837205d2fa3e8b5eb2249db46b4eeadbef18 | cade292abe0d519af39c06d849673445005b4edb2cc070c98a5abca10a0e4965 | cade292abe0d519af39c06d849673445005b4edb2cc070c98a5abca10a0e4965 | no |
| src/render/RenderEngine.js | 1ec9a6b439cfce635224ee37ad5f735b472240e4db2282135ae0a08a0410734e | 1ec9a6b439cfce635224ee37ad5f735b472240e4db2282135ae0a08a0410734e | 7bc31cbc9f618ef8bb180171546bd58c62857b5a01edc41bdb59e8e6429a7508 | 7bc31cbc9f618ef8bb180171546bd58c62857b5a01edc41bdb59e8e6429a7508 | no |
| src/render/RenderResourceEnvironment.js | fd65f02d5e4d6f42a5d6876ee29b5851ed1e461a0e114b2d08f39ee766212772 | fd65f02d5e4d6f42a5d6876ee29b5851ed1e461a0e114b2d08f39ee766212772 | 9b3ce6c1cc56888daa9fd5b191eb5bb5c7ffd95e45e322252198e89df9161bed | 9b3ce6c1cc56888daa9fd5b191eb5bb5c7ffd95e45e322252198e89df9161bed | no |
| src/render/RenderResourceLighting.js | 636bf1054bc2e893dc2e15f01e0ec207e0e033e764d72e31e59cd16f4705ca86 | 636bf1054bc2e893dc2e15f01e0ec207e0e033e764d72e31e59cd16f4705ca86 | 6b90915e2216a73b9b43f17f758305211f2ee50afcb8959eb0ee0efa572dfffb | 6b90915e2216a73b9b43f17f758305211f2ee50afcb8959eb0ee0efa572dfffb | no |
| src/render/RenderResources.js | c6dbf5c3a46d16e4f6d8454ffe713dd99aee4b27fd65d17834251a2c04ae4cad | c6dbf5c3a46d16e4f6d8454ffe713dd99aee4b27fd65d17834251a2c04ae4cad | af13b06f524890894dd89e1bba37ad922a367ebfa9006c6d27fe7e4f1d9c5e9d | af13b06f524890894dd89e1bba37ad922a367ebfa9006c6d27fe7e4f1d9c5e9d | no |
| src/render/RenderSceneAdapter.js | 29f0b581865fa6706ac87490888264303a212951387c33a5255945f1ff8111f9 | 29f0b581865fa6706ac87490888264303a212951387c33a5255945f1ff8111f9 | a9c05524c301443ebce62588f3ad778eae91248ebd816554e44ed3f8615797ad | a9c05524c301443ebce62588f3ad778eae91248ebd816554e44ed3f8615797ad | no |
| src/render/RenderShadowFilter.js | 3ef9ba5ebd4f824699b0e82730895fcd3a076dbae8a0bc87e88e3b179790acd3 | 3ef9ba5ebd4f824699b0e82730895fcd3a076dbae8a0bc87e88e3b179790acd3 | e284a7a33ab270addaa358654d453415ee599e982aec4113ea93409c71f7e132 | e284a7a33ab270addaa358654d453415ee599e982aec4113ea93409c71f7e132 | no |
| src/render/STUDIO_RENDERING.md | absent | absent | 31d024b54f7711fb895f00b4dfbd7249526b6d40304d56291686453197b11321 | 31d024b54f7711fb895f00b4dfbd7249526b6d40304d56291686453197b11321 | no |
| src/render/StudioFloor.js | absent | absent | 7b2a76c4d0a30d0d7966fa2564b78475f99813e494a472178309c67f75215d51 | 7b2a76c4d0a30d0d7966fa2564b78475f99813e494a472178309c67f75215d51 | no |

## 3b05b520e3bb98f882edbdcd4e2e3b4ee2545d55cde319920c84a17484cd7bd2

Message: Record completed studio rendering regression, three production builds and standalone release verification

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/STUDIO_RENDERING.md | 31d024b54f7711fb895f00b4dfbd7249526b6d40304d56291686453197b11321 | 31d024b54f7711fb895f00b4dfbd7249526b6d40304d56291686453197b11321 | be3c58568dc050ae36e3f139c2ddc17fb58469e1baac0421d149cfb3d0a99a83 | be3c58568dc050ae36e3f139c2ddc17fb58469e1baac0421d149cfb3d0a99a83 | no |

## 8a6457f35b60ded4a10c0e5de31f0ff8aa5cf3e3baaea6afaf979eb69ac86d45

Message: Antialias mirror captures and blend distant floor reflections into a softer filtered level; retain final FXAA with progressive AA

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/editor/plugins/Render_Nodes.js | f018aed8da984a99e2c08106939ce9dd8b0a859ac92de33c47074581c7841b3b | f018aed8da984a99e2c08106939ce9dd8b0a859ac92de33c47074581c7841b3b | 22065438640db421dbb83bfd6c18b3de368438bd10164411ef677cacbab0203e | 22065438640db421dbb83bfd6c18b3de368438bd10164411ef677cacbab0203e | no |
| src/render/RasterRenderer.js | ab66d91546830cb5372f503fb21ea15425991567170fada2feaab944aff54bcd | ab66d91546830cb5372f503fb21ea15425991567170fada2feaab944aff54bcd | 1aaf2046292aa1b763adb7d63249fcb739d78b3388df2182873c47e8da654ada | 1aaf2046292aa1b763adb7d63249fcb739d78b3388df2182873c47e8da654ada | no |
| src/render/RenderConfiguration.js | cade292abe0d519af39c06d849673445005b4edb2cc070c98a5abca10a0e4965 | cade292abe0d519af39c06d849673445005b4edb2cc070c98a5abca10a0e4965 | 369c85126ad063d03c9e624b95d1ee0ebf02ac6d484dbe1c42e92ec0debb3ddf | 369c85126ad063d03c9e624b95d1ee0ebf02ac6d484dbe1c42e92ec0debb3ddf | no |
| src/render/STUDIO_RENDERING.md | be3c58568dc050ae36e3f139c2ddc17fb58469e1baac0421d149cfb3d0a99a83 | be3c58568dc050ae36e3f139c2ddc17fb58469e1baac0421d149cfb3d0a99a83 | 60c1253d499a867279519c5ccc98ded9d636bdf852571a718da7ad0d2a7f70a9 | 60c1253d499a867279519c5ccc98ded9d636bdf852571a718da7ad0d2a7f70a9 | no |
| src/render/StudioFloor.js | 7b2a76c4d0a30d0d7966fa2564b78475f99813e494a472178309c67f75215d51 | 7b2a76c4d0a30d0d7966fa2564b78475f99813e494a472178309c67f75215d51 | 84a672b86fa41c3a732a80b226f0a00c27bb2f33ef3afbef039197b84146c7e7 | 84a672b86fa41c3a732a80b226f0a00c27bb2f33ef3afbef039197b84146c7e7 | no |

## 70208a028ddbd27c21165e92a16669c1c013e5f8da0a5bcea68428151aa2a9c3

Message: Record successful distance-blur archive regression and all production builds

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/STUDIO_RENDERING.md | 60c1253d499a867279519c5ccc98ded9d636bdf852571a718da7ad0d2a7f70a9 | 60c1253d499a867279519c5ccc98ded9d636bdf852571a718da7ad0d2a7f70a9 | 4c9c2dfa5b49e16d0b34ec012e5d9ceaa4be426f745d3044efcdb1b61e59a6ee | 4c9c2dfa5b49e16d0b34ec012e5d9ceaa4be426f745d3044efcdb1b61e59a6ee | no |

## d23cbf20c7ded4711592fd5ae0d4c5e3d3ef00dc8e00638e9a8477c8773ba1e9

Message: Implement shared rough-transmission blur with pixel and resource-lifetime validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | bd7a93010ca0648eb0505cf02624cd45d2cd25e70919bbd2363786c5a6a8c878 | bd7a93010ca0648eb0505cf02624cd45d2cd25e70919bbd2363786c5a6a8c878 | 65732b215170a45bc78afc0a0ad8235f03646de556cee35dc6d49a0736ebde75 | 65732b215170a45bc78afc0a0ad8235f03646de556cee35dc6d49a0736ebde75 | no |
| src/render/MaterialSurface.js | f2afe70d9ee45da004954cea9473bbe28a851b7b88d548fd495b1a4530cbc62a | f2afe70d9ee45da004954cea9473bbe28a851b7b88d548fd495b1a4530cbc62a | 6693ec9576b0470246d171967d6b5d53af99816a9798939dcd3d14c1324f040c | 6693ec9576b0470246d171967d6b5d53af99816a9798939dcd3d14c1324f040c | no |
| src/render/STUDIO_RENDERING.md | 4c9c2dfa5b49e16d0b34ec012e5d9ceaa4be426f745d3044efcdb1b61e59a6ee | 4c9c2dfa5b49e16d0b34ec012e5d9ceaa4be426f745d3044efcdb1b61e59a6ee | 6f5faef95364ee4d795da99416af9f030d08a6b38fce7b3fcc90db55b18c8355 | 6f5faef95364ee4d795da99416af9f030d08a6b38fce7b3fcc90db55b18c8355 | no |

## f7e84a66212db1a26b1f8881b2d0e155fba62a1944f444023751a754b9176d74

Message: Record completed frosted-glass build, browser integration and release verification

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/STUDIO_RENDERING.md | 6f5faef95364ee4d795da99416af9f030d08a6b38fce7b3fcc90db55b18c8355 | 6f5faef95364ee4d795da99416af9f030d08a6b38fce7b3fcc90db55b18c8355 | ed8a42c5d27f2d37b147f427bbbbb45f390708d3d55425482ece94046f03fdf2 | ed8a42c5d27f2d37b147f427bbbbb45f390708d3d55425482ece94046f03fdf2 | no |

## 94fef2295024fcdb90c1ad643fc643832bb33841e9c7776ee9fde1345a27fcb4

Message: Add object-local U/V repeat with stable node ports, source material isolation and archive persistence

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| public/editor/plugins/UV_Nodes.js | ae79e8270a830670d5efa7f6d2b340fa90a8627f48a28a152a37869ee4065437 | ae79e8270a830670d5efa7f6d2b340fa90a8627f48a28a152a37869ee4065437 | ac6d06abbea18fc67b05b0fae8f2fc77a39abbfb75d5e0978512e96cc646cea3 | ac6d06abbea18fc67b05b0fae8f2fc77a39abbfb75d5e0978512e96cc646cea3 | no |
| src/DisplayPipeline.js | 68c2c5b852bd0e6d2fa5408a2430191588e42a3645a80b971a7ae8d27c43b6d6 | 68c2c5b852bd0e6d2fa5408a2430191588e42a3645a80b971a7ae8d27c43b6d6 | b491e5a7d539eb20a4c28231d5512e718cc3baec9ea9f0b68dad19f4f0c31bf0 | b491e5a7d539eb20a4c28231d5512e718cc3baec9ea9f0b68dad19f4f0c31bf0 | no |
| src/collaboration/SceneDisplayPacket.js | f103aef828466620af37e646e58fc51958cdab4f468c38b1b6a2589daf033674 | f103aef828466620af37e646e58fc51958cdab4f468c38b1b6a2589daf033674 | 1a3ca656aa27e945ad20b1088e2247eb699242db73dd5bf8fd7b5852049743a7 | 1a3ca656aa27e945ad20b1088e2247eb699242db73dd5bf8fd7b5852049743a7 | no |
| src/render/ImportedMaterialEditor.js | 003896e6bbaba5dd96ecfd817aab1a51744d2da7e4f7d35b98bea69f9e8b5ecc | 003896e6bbaba5dd96ecfd817aab1a51744d2da7e4f7d35b98bea69f9e8b5ecc | 2d5dcd461b787aefc129ee4a150348f231551867ffeb55cfd601819bf18d924b | 2d5dcd461b787aefc129ee4a150348f231551867ffeb55cfd601819bf18d924b | no |
| src/render/OBJECT_UV.md | absent | absent | ed7268e75da8f3837537b9bc77ac37f6ce2cc09612bfd16156f78218a2369789 | ed7268e75da8f3837537b9bc77ac37f6ce2cc09612bfd16156f78218a2369789 | no |
| src/render/ObjectUVEditor.js | c54dd889b3d0e84e3137b551cbd9ccdc62de44d32a1a1c5765b99dcaec286974 | c54dd889b3d0e84e3137b551cbd9ccdc62de44d32a1a1c5765b99dcaec286974 | 54623d4c981e1fab9d46553e5c812e7ca266271b4829e47a86d8211b4174ad66 | 54623d4c981e1fab9d46553e5c812e7ca266271b4829e47a86d8211b4174ad66 | no |

## fb3cac9ff5c14e319b648f2e219146f81e5200eb7a5dcbb0dde9955984359984

Message: Record UV repeat integration, archive round-trip and three-build verification

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/OBJECT_UV.md | ed7268e75da8f3837537b9bc77ac37f6ce2cc09612bfd16156f78218a2369789 | ed7268e75da8f3837537b9bc77ac37f6ce2cc09612bfd16156f78218a2369789 | 5ec15eb51e9f85132009e4b9b1b8abbd00f6f6221fa4d8fb3411c597f2470e4d | 5ec15eb51e9f85132009e4b9b1b8abbd00f6f6221fa4d8fb3411c597f2470e4d | no |

## a0666382d4cd3a22078dbcb37e43a84e81f7b266595410acd298c8cb0ff47b57

Message: Fix layered glass transmission, transparent shadows and AO color-block artifacts

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | 65732b215170a45bc78afc0a0ad8235f03646de556cee35dc6d49a0736ebde75 | 65732b215170a45bc78afc0a0ad8235f03646de556cee35dc6d49a0736ebde75 | 33c92ed0d31784733077970b6ca7b4dde0269e646c1ea3bbb966a931672ee627 | 33c92ed0d31784733077970b6ca7b4dde0269e646c1ea3bbb966a931672ee627 | no |
| src/render/RasterRenderer.js | 1aaf2046292aa1b763adb7d63249fcb739d78b3388df2182873c47e8da654ada | 1aaf2046292aa1b763adb7d63249fcb739d78b3388df2182873c47e8da654ada | 75d962792700aa8004ecdbe5e0be104724cfe5806d386feec3fa420b6cbd064e | 75d962792700aa8004ecdbe5e0be104724cfe5806d386feec3fa420b6cbd064e | no |
| src/render/RasterSSAOPass.js | c81578d9b9d6cbf6ce1d46c3a76483349b732d5bcb6309c69e945f95b5977bf8 | c81578d9b9d6cbf6ce1d46c3a76483349b732d5bcb6309c69e945f95b5977bf8 | afef4926c0821082c1c52ce3645c42aab3b4916e3bb1efbadc1382b2bee97739 | afef4926c0821082c1c52ce3645c42aab3b4916e3bb1efbadc1382b2bee97739 | no |
| src/render/STUDIO_RENDERING.md | ed8a42c5d27f2d37b147f427bbbbb45f390708d3d55425482ece94046f03fdf2 | ed8a42c5d27f2d37b147f427bbbbb45f390708d3d55425482ece94046f03fdf2 | abc593754f7d70d370122e0bd0ab1b8d1e36699e9fdf312f9514e8dc5f8c27fe | abc593754f7d70d370122e0bd0ab1b8d1e36699e9fdf312f9514e8dc5f8c27fe | no |

## 4a92b13c90af0828d12846f6bfa70eba59aab5800c904d51ec5af347bb8b3f19

Message: Record layered glass regression, shadow cleanup and final browser validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/STUDIO_RENDERING.md | abc593754f7d70d370122e0bd0ab1b8d1e36699e9fdf312f9514e8dc5f8c27fe | abc593754f7d70d370122e0bd0ab1b8d1e36699e9fdf312f9514e8dc5f8c27fe | 87baf6648e563057048f3ac06526abfe3c2b70430ec77696ab594042f410a2da | 87baf6648e563057048f3ac06526abfe3c2b70430ec77696ab594042f410a2da | no |

## 0f83510d8ed9635280ab0192f95e8ebf540c9f07fdd0f6a2365ab6652aa5c1ca

Message: Add authored scene-object reflections for raster materials

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | 33c92ed0d31784733077970b6ca7b4dde0269e646c1ea3bbb966a931672ee627 | 33c92ed0d31784733077970b6ca7b4dde0269e646c1ea3bbb966a931672ee627 | 64ff802455ced893aa4e7bbfee5646f466e44b84ad1ddb46c0ca098eaa7b222a | 64ff802455ced893aa4e7bbfee5646f466e44b84ad1ddb46c0ca098eaa7b222a | no |
| src/render/MaterialSurface.js | 6693ec9576b0470246d171967d6b5d53af99816a9798939dcd3d14c1324f040c | 6693ec9576b0470246d171967d6b5d53af99816a9798939dcd3d14c1324f040c | 5b18bd673858b63f94b3db51f7d8670c82f268f5f5d8a23af23692cc01b849e5 | 5b18bd673858b63f94b3db51f7d8670c82f268f5f5d8a23af23692cc01b849e5 | no |
| src/render/STUDIO_RENDERING.md | 87baf6648e563057048f3ac06526abfe3c2b70430ec77696ab594042f410a2da | 87baf6648e563057048f3ac06526abfe3c2b70430ec77696ab594042f410a2da | 908e2cb601108f1f57bbbf846aad56b2ab2dca01a8beff24c240d890ce223d0f | 908e2cb601108f1f57bbbf846aad56b2ab2dca01a8beff24c240d890ce223d0f | no |

## 89bc0a741ecf0e48488d247a9415119e6fd1488ff7e33cfc60c2e4e3d01f8c71

Message: Cache authored reflection captures across stable raster samples

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | 64ff802455ced893aa4e7bbfee5646f466e44b84ad1ddb46c0ca098eaa7b222a | 64ff802455ced893aa4e7bbfee5646f466e44b84ad1ddb46c0ca098eaa7b222a | caee3f7d0991e125f319328e7a2cf7d5f98fd1a212695044b354a1838e873fe4 | caee3f7d0991e125f319328e7a2cf7d5f98fd1a212695044b354a1838e873fe4 | no |
| src/render/RasterRenderer.js | 75d962792700aa8004ecdbe5e0be104724cfe5806d386feec3fa420b6cbd064e | 75d962792700aa8004ecdbe5e0be104724cfe5806d386feec3fa420b6cbd064e | fbbb07cf250570166d425fc2300e87cf84d6c556af334488d38fc96bb4acfb0e | fbbb07cf250570166d425fc2300e87cf84d6c556af334488d38fc96bb4acfb0e | no |
| src/render/STUDIO_RENDERING.md | 908e2cb601108f1f57bbbf846aad56b2ab2dca01a8beff24c240d890ce223d0f | 908e2cb601108f1f57bbbf846aad56b2ab2dca01a8beff24c240d890ce223d0f | ff84a357da3ce8c92724dbaf59412d0e107aea4d06a56c133a580681d0005570 | ff84a357da3ce8c92724dbaf59412d0e107aea4d06a56c133a580681d0005570 | no |

## b633ec5e45de9afe40c5e57d80587d02d16e28e2572a2fb439726fcd927e2efd

Message: Fix reflective material depth coordinates and logarithmic-depth capture

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | caee3f7d0991e125f319328e7a2cf7d5f98fd1a212695044b354a1838e873fe4 | caee3f7d0991e125f319328e7a2cf7d5f98fd1a212695044b354a1838e873fe4 | af2d796a4af40933944845d7919acb4fae274fc52417ecc9f7fcd99093670d0c | af2d796a4af40933944845d7919acb4fae274fc52417ecc9f7fcd99093670d0c | no |
| src/render/MaterialSurface.js | 5b18bd673858b63f94b3db51f7d8670c82f268f5f5d8a23af23692cc01b849e5 | 5b18bd673858b63f94b3db51f7d8670c82f268f5f5d8a23af23692cc01b849e5 | 1d80fe91594d9f6a176a76be8f71da1881f4a08088e2d233e2922368e0f9f2e0 | 1d80fe91594d9f6a176a76be8f71da1881f4a08088e2d233e2922368e0f9f2e0 | no |
| src/render/STUDIO_RENDERING.md | ff84a357da3ce8c92724dbaf59412d0e107aea4d06a56c133a580681d0005570 | ff84a357da3ce8c92724dbaf59412d0e107aea4d06a56c133a580681d0005570 | b58871a10a4bd5625e7e2115ab786ba8e234713e6e69d45e41c1e42c84b74bc1 | b58871a10a4bd5625e7e2115ab786ba8e234713e6e69d45e41c1e42c84b74bc1 | no |

## 9d6d43e53df63b027f2131ef6b70e613e2f2f56f38282c1d1de0171fa4ba46ff

Message: Use mirrored camera projection for planar material reflections

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | af2d796a4af40933944845d7919acb4fae274fc52417ecc9f7fcd99093670d0c | af2d796a4af40933944845d7919acb4fae274fc52417ecc9f7fcd99093670d0c | 5fe8bc3dac3e41dda0180b2e33413faf17f76202d4a4a0fb5bf9c1bd28449ce0 | 5fe8bc3dac3e41dda0180b2e33413faf17f76202d4a4a0fb5bf9c1bd28449ce0 | no |
| src/render/MaterialSurface.js | 1d80fe91594d9f6a176a76be8f71da1881f4a08088e2d233e2922368e0f9f2e0 | 1d80fe91594d9f6a176a76be8f71da1881f4a08088e2d233e2922368e0f9f2e0 | 0c305493721c9657277928a2d6f9259f1340be1f9f1ca49af821ab75ea8177d2 | 0c305493721c9657277928a2d6f9259f1340be1f9f1ca49af821ab75ea8177d2 | no |
| src/render/STUDIO_RENDERING.md | b58871a10a4bd5625e7e2115ab786ba8e234713e6e69d45e41c1e42c84b74bc1 | b58871a10a4bd5625e7e2115ab786ba8e234713e6e69d45e41c1e42c84b74bc1 | 2dae05337aa05d3291cb0dbbef9cf1a6a327b366eabb145593600c0721a894de | 2dae05337aa05d3291cb0dbbef9cf1a6a327b366eabb145593600c0721a894de | no |

## 2108951cbc29738290ab96a8070d92a64e1af839dfecb1f0fd16c520d55f8cfd

Message: Correct planar reflection camera orientation so ground reflections mirror instead of translating

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | 5fe8bc3dac3e41dda0180b2e33413faf17f76202d4a4a0fb5bf9c1bd28449ce0 | 5fe8bc3dac3e41dda0180b2e33413faf17f76202d4a4a0fb5bf9c1bd28449ce0 | 304c9941946e506f3d332add721d9e38d8842ccd5af72fc276c03edff19c9501 | 304c9941946e506f3d332add721d9e38d8842ccd5af72fc276c03edff19c9501 | no |

## c9d909b555e0aaec14095883d368624c0181968f1df7c2eac0c4262803ce0c04

Message: Use the camera up axis for Z-up planar reflection orientation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | 304c9941946e506f3d332add721d9e38d8842ccd5af72fc276c03edff19c9501 | 304c9941946e506f3d332add721d9e38d8842ccd5af72fc276c03edff19c9501 | 31fdfe63659db3688165426b979781c597cd9852ad5a7eab14e520493ab10c15 | 31fdfe63659db3688165426b979781c597cd9852ad5a7eab14e520493ab10c15 | no |

## 4efe8fc01d008d7c21252f8f968ccc7778f432d8afa2d73af09a52fbc0e90a49

Message: Unify realtime reflection, refraction, frosted glass and material state handling

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/BackendPandaUIDoc.js | 2e02854dc481a3b9491ffbc11e4f1240108887acb0774081820a27598ade46f7 | 2e02854dc481a3b9491ffbc11e4f1240108887acb0774081820a27598ade46f7 | 3b09cde6a7b925ee6564b5a9dab83e754ea216b1e65d9fa1aa1f6608846b9558 | 3b09cde6a7b925ee6564b5a9dab83e754ea216b1e65d9fa1aa1f6608846b9558 | no |
| src/display/SceneMaterialEditor.js | 0fe125bea9b6d833b84750866d19314710c4667fa48ff663548f3fa965e4b170 | 0fe125bea9b6d833b84750866d19314710c4667fa48ff663548f3fa965e4b170 | e0ba9deffc11c160587c98c714c481274ff6b74111a85b276835f9af84fba8ec | e0ba9deffc11c160587c98c714c481274ff6b74111a85b276835f9af84fba8ec | no |
| src/layouts/MainLayout.vue | bdcce2b616fb9bd5997effc526f1dcf5acf3f742483ec8fbe6b5c71c6f07c1b9 | bdcce2b616fb9bd5997effc526f1dcf5acf3f742483ec8fbe6b5c71c6f07c1b9 | cfbb6e851a4ed526a5d6d881717bea9d8e47f520d1c0a836a43c88cf48b4b47e | cfbb6e851a4ed526a5d6d881717bea9d8e47f520d1c0a836a43c88cf48b4b47e | no |
| src/render/ImportedMaterialEditor.js | 2d5dcd461b787aefc129ee4a150348f231551867ffeb55cfd601819bf18d924b | 2d5dcd461b787aefc129ee4a150348f231551867ffeb55cfd601819bf18d924b | b0330c65c9bb7a73c1d8ec3e2a12a9b76ba8b46b1ff1e385a60bfabf5317c347 | b0330c65c9bb7a73c1d8ec3e2a12a9b76ba8b46b1ff1e385a60bfabf5317c347 | no |
| src/render/MaterialSurface.js | 0c305493721c9657277928a2d6f9259f1340be1f9f1ca49af821ab75ea8177d2 | 0c305493721c9657277928a2d6f9259f1340be1f9f1ca49af821ab75ea8177d2 | dab91758cdb82d0d50029b46ef0b964a2aa93b9f0c6fb70beb25ae23c993bd0b | dab91758cdb82d0d50029b46ef0b964a2aa93b9f0c6fb70beb25ae23c993bd0b | no |

## 6edcda709578e8db384f7855d7f3f6660c327da2ff5d1691f0b6007eac715f86

Message: Unify typed render bindings with the surface IOR path

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/RenderResourceMaterials.js | 69b0b5b567fdcc6b4be6a15b3efd51d2c46916cde409886667be328003d72091 | 69b0b5b567fdcc6b4be6a15b3efd51d2c46916cde409886667be328003d72091 | 65f9ee2196706453fdf5650d8736edb7c70fa3fa9588e1a377ea274adff95bc1 | 65f9ee2196706453fdf5650d8736edb7c70fa3fa9588e1a377ea274adff95bc1 | no |

## dbb96579fbef4bcf1e96d1b5301d7ffb87d1b5be809d83fe11c02852259a8732

Message: Fix render-only archive material persistence and diagnostics

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/LOCAL_DOCUMENT_STORAGE.md | c40928d3bbeea9611066ee668cca8bdcaeaae40364348ff87be3c422a5fce468 | c40928d3bbeea9611066ee668cca8bdcaeaae40364348ff87be3c422a5fce468 | 776a924b46b45c8a1e4576ba2b68f14c8fb71f730cbeeae1fbba5432e8228146 | 776a924b46b45c8a1e4576ba2b68f14c8fb71f730cbeeae1fbba5432e8228146 | no |
| scripts/test-local-document-folder-browser.cjs | 2462c3383703a1b0e3cd9143ab667dfa2350bac63f7d9dc9eaf0f76ba0e5e80d | 2462c3383703a1b0e3cd9143ab667dfa2350bac63f7d9dc9eaf0f76ba0e5e80d | bc59593533cd42cf9d037cd17f9b6e819ab89fdc84d96ecc36af66e6ebbac586 | bc59593533cd42cf9d037cd17f9b6e819ab89fdc84d96ecc36af66e6ebbac586 | no |
| src/storage/LocalDocumentArchive.js | 87beb1af63e0d396def927243768b768422fd1e917a96267feb758b3e4ed0de6 | 87beb1af63e0d396def927243768b768422fd1e917a96267feb758b3e4ed0de6 | b1bc96e7db6427aab29935ec517ddc700733f36e245421fb02a6738a93415b62 | b1bc96e7db6427aab29935ec517ddc700733f36e245421fb02a6738a93415b62 | no |

## f1f2cb0396267448d44388a108a0d099eac02f4bc3b1bc1ae16293e7a81a36ea

Message: Make render data saving respond to direct user clicks

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | d26b2d3058de13c4d3f26a0e6742e0c4375dda7470295bf75b634796a0b4153a | d26b2d3058de13c4d3f26a0e6742e0c4375dda7470295bf75b634796a0b4153a | 2537d5e97772c57584a7a784547ab82026ff1e3ab9bccadaf76510d2452c5902 | 2537d5e97772c57584a7a784547ab82026ff1e3ab9bccadaf76510d2452c5902 | no |

## ebf727de3aae1370d6fc5dc2aa09675567b0a2c76498c3f028bba73aa985c948

Message: Make render archive permission checks respond to direct clicks

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 2537d5e97772c57584a7a784547ab82026ff1e3ab9bccadaf76510d2452c5902 | 2537d5e97772c57584a7a784547ab82026ff1e3ab9bccadaf76510d2452c5902 | 34648eb3ab514b57d5a273e718648f82ec19853e3f61f3092758afb27b8bb957 | 34648eb3ab514b57d5a273e718648f82ec19853e3f61f3092758afb27b8bb957 | no |

## 7d8074d263b472282beef099298fcc8cde006f8278cc827ca482908be42f4752

Message: Clarify cancelled render archive picker feedback

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 34648eb3ab514b57d5a273e718648f82ec19853e3f61f3092758afb27b8bb957 | 34648eb3ab514b57d5a273e718648f82ec19853e3f61f3092758afb27b8bb957 | 388578479874d606efd39b9eaf8a08799933d90e904bf71471222e69907381d3 | 388578479874d606efd39b9eaf8a08799933d90e904bf71471222e69907381d3 | no |

## 91866d2cbef50c2b88ef26102f4e1d116507028a8e4efdd4c7b43f9f158da48b

Message: Avoid duplicate render archive permission prompts

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/PandaUIApp.js | 07dffc7a44a67f2c3d67a33efc3a10fe4a8e0dd7a3bd67be4941efa3b3857782 | 07dffc7a44a67f2c3d67a33efc3a10fe4a8e0dd7a3bd67be4941efa3b3857782 | cbaf288059bb5ea4824e5491bae0b8c8434605634313e3d3a3c5b3268807289c | cbaf288059bb5ea4824e5491bae0b8c8434605634313e3d3a3c5b3268807289c | no |
| src/components/SceneDocumentsPanel.vue | 388578479874d606efd39b9eaf8a08799933d90e904bf71471222e69907381d3 | 388578479874d606efd39b9eaf8a08799933d90e904bf71471222e69907381d3 | c52d00909ee0beb42001c297d7dc89e6108d4057984a471c6f0febbda9fb23b8 | c52d00909ee0beb42001c297d7dc89e6108d4057984a471c6f0febbda9fb23b8 | no |

## c843612accb06736595ccc3c1af65378a91ea4f7abf42179a47bf332fa7da72c

Message: Reuse selected render archive handles without duplicate permission prompts

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | c52d00909ee0beb42001c297d7dc89e6108d4057984a471c6f0febbda9fb23b8 | c52d00909ee0beb42001c297d7dc89e6108d4057984a471c6f0febbda9fb23b8 | 8398d3fb0157d690e1a98501602befc9d17b8899329326fcba2fa74e28fbff30 | 8398d3fb0157d690e1a98501602befc9d17b8899329326fcba2fa74e28fbff30 | no |

## 7efed0a71fab6f90e17646c03bd95cd1e6c70ba25e13b2573587ccf8b001f3c2

Message: Revalidate browser render-folder permissions after restart

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 8398d3fb0157d690e1a98501602befc9d17b8899329326fcba2fa74e28fbff30 | 8398d3fb0157d690e1a98501602befc9d17b8899329326fcba2fa74e28fbff30 | 9a0ec3a65124f79985016589637b9b313f847e2e91635bb80afab98641488544 | 9a0ec3a65124f79985016589637b9b313f847e2e91635bb80afab98641488544 | no |

## 55aa4623094bd85f155690cb87c818c7c50c3a7b6193227574ed249b4d86578f

Message: Use a fresh render-folder handle after Edge permission resets

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 9a0ec3a65124f79985016589637b9b313f847e2e91635bb80afab98641488544 | 9a0ec3a65124f79985016589637b9b313f847e2e91635bb80afab98641488544 | 464e1168db6d7055be605d18cb54303d5a550ef0a0c7719345f1863fd75b0458 | 464e1168db6d7055be605d18cb54303d5a550ef0a0c7719345f1863fd75b0458 | no |

## beec4f15bc9025415c3127bff0f1b7291b3618ea45438e383f11c107242e9981

Message: Add name-based browser render storage without folder picker

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/PandaUIApp.js | cbaf288059bb5ea4824e5491bae0b8c8434605634313e3d3a3c5b3268807289c | cbaf288059bb5ea4824e5491bae0b8c8434605634313e3d3a3c5b3268807289c | c4dce636c8f7a5e00f0140b846a1c134609bdfbe2613910b01a54002d447e4c2 | c4dce636c8f7a5e00f0140b846a1c134609bdfbe2613910b01a54002d447e4c2 | no |
| src/components/SceneDocumentsPanel.vue | 464e1168db6d7055be605d18cb54303d5a550ef0a0c7719345f1863fd75b0458 | 464e1168db6d7055be605d18cb54303d5a550ef0a0c7719345f1863fd75b0458 | 30511a9d94d4a2c67c1f16303e956c550b030e1dbacf4bdff8c42175209b6882 | 30511a9d94d4a2c67c1f16303e956c550b030e1dbacf4bdff8c42175209b6882 | no |

## e3bbe8608d7c955cee133ffe8ecf1bd94e85ab775b0ba61cc785bdc6c6f72e6f

Message: Unify document and render actions in browser storage

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/PandaUIApp.js | c4dce636c8f7a5e00f0140b846a1c134609bdfbe2613910b01a54002d447e4c2 | c4dce636c8f7a5e00f0140b846a1c134609bdfbe2613910b01a54002d447e4c2 | 82b6e6e9a509fcc045ca74e76230c6b71cd57cfa6b03734b9224893cb1fde968 | 82b6e6e9a509fcc045ca74e76230c6b71cd57cfa6b03734b9224893cb1fde968 | no |
| src/components/SceneDocumentsPanel.vue | 30511a9d94d4a2c67c1f16303e956c550b030e1dbacf4bdff8c42175209b6882 | 30511a9d94d4a2c67c1f16303e956c550b030e1dbacf4bdff8c42175209b6882 | 0452005de93a57c2f6e4d9abd37abd64cb315273fb1d17c9789e4a638319a683 | 0452005de93a57c2f6e4d9abd37abd64cb315273fb1d17c9789e4a638319a683 | no |

## afc8ebaa0f6452776de4bbed8373d36a5c11ce243c833105fe37bf4e356339f3

Message: Clarify source-file import versus browser archive import

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 0452005de93a57c2f6e4d9abd37abd64cb315273fb1d17c9789e4a638319a683 | 0452005de93a57c2f6e4d9abd37abd64cb315273fb1d17c9789e4a638319a683 | 917d531d2fa7d44a626aa2d85631d7380a829f0caf511fe0e4be00bcc7658b88 | 917d531d2fa7d44a626aa2d85631d7380a829f0caf511fe0e4be00bcc7658b88 | no |

## ce740a504979387df451627c794ab48d3888bc83c4636dd38233b395d6bcd01a

Message: Add Document Manager confirmation dialogs before native file actions

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 917d531d2fa7d44a626aa2d85631d7380a829f0caf511fe0e4be00bcc7658b88 | 917d531d2fa7d44a626aa2d85631d7380a829f0caf511fe0e4be00bcc7658b88 | 5768c18dd24f37636b3b6c38872b1d2134f80f8896d138d4119bfdc9558610d4 | 5768c18dd24f37636b3b6c38872b1d2134f80f8896d138d4119bfdc9558610d4 | no |

## 8722a88b063a45dba2fc2d5d301d80a5293da8a80706d38f19cb5b861e7b7eb8

Message: Remove custom Document Manager confirmation dialog

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 5768c18dd24f37636b3b6c38872b1d2134f80f8896d138d4119bfdc9558610d4 | 5768c18dd24f37636b3b6c38872b1d2134f80f8896d138d4119bfdc9558610d4 | c6427ddf0dfaca860d47bcc8407d5a0457aa859bb1565f27f34993ed4ea515a8 | c6427ddf0dfaca860d47bcc8407d5a0457aa859bb1565f27f34993ed4ea515a8 | no |

## db56ef9e3c6f796647d32c237d80853cb1e35e501faa34bf02f278c7ed43f386

Message: Always use the folder selected for each save operation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/PandaUIApp.js | 82b6e6e9a509fcc045ca74e76230c6b71cd57cfa6b03734b9224893cb1fde968 | 82b6e6e9a509fcc045ca74e76230c6b71cd57cfa6b03734b9224893cb1fde968 | 04201c7f96199d95b5f87714902a4da7b3a89170709d1ee12377ef3402bae066 | 04201c7f96199d95b5f87714902a4da7b3a89170709d1ee12377ef3402bae066 | no |

## 0f71380fd3f2751a8a86a51b7a88a290f4ba84d79f8c8456a0ec713716e29bf9

Message: Keep folder picker inside direct click handlers

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | c6427ddf0dfaca860d47bcc8407d5a0457aa859bb1565f27f34993ed4ea515a8 | c6427ddf0dfaca860d47bcc8407d5a0457aa859bb1565f27f34993ed4ea515a8 | 4ced26bb062ca58e7908f25c071a917e2e29f468569d51300a79448dbf5885e5 | 4ced26bb062ca58e7908f25c071a917e2e29f468569d51300a79448dbf5885e5 | no |

## a0d75213aa79f271f6695549b493c2fbd0540c99d4febe74d2a0abbe71d64b2e

Message: Invoke directory picker synchronously from save clicks

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 4ced26bb062ca58e7908f25c071a917e2e29f468569d51300a79448dbf5885e5 | 4ced26bb062ca58e7908f25c071a917e2e29f468569d51300a79448dbf5885e5 | 95e800f8d69657ffcdf11baef30dc3f71c3f91f1b7c0377257f49eef2d0f6b80 | 95e800f8d69657ffcdf11baef30dc3f71c3f91f1b7c0377257f49eef2d0f6b80 | no |

## 6b541968cbd1728fe7411e206f1ab965f9a99326defd06dc29a4e04db7168877

Message: Avoid reactive rerender while opening Edge folder picker

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 95e800f8d69657ffcdf11baef30dc3f71c3f91f1b7c0377257f49eef2d0f6b80 | 95e800f8d69657ffcdf11baef30dc3f71c3f91f1b7c0377257f49eef2d0f6b80 | e632f519a272beb618dc8b2370d5915eb9834925ffe55bf73d4748b5716e33aa | e632f519a272beb618dc8b2370d5915eb9834925ffe55bf73d4748b5716e33aa | no |

## 00ee96f5bb21a323d470b55a6fc7ef2ec52fe8082654827dd8d0db40190efc54

Message: Export render data through a custom name dialog

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | e632f519a272beb618dc8b2370d5915eb9834925ffe55bf73d4748b5716e33aa | e632f519a272beb618dc8b2370d5915eb9834925ffe55bf73d4748b5716e33aa | adff697d5c158776ad8c793776767eeba56f222ed7d011131dacc7878830bae1 | adff697d5c158776ad8c793776767eeba56f222ed7d011131dacc7878830bae1 | no |

## 60515cc3b592ddbc4404456c5e09087d812b5ab69543affe2e5732616b595e93

Message: Create per-document render project folders under browser archive roots

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/PandaUIApp.js | 04201c7f96199d95b5f87714902a4da7b3a89170709d1ee12377ef3402bae066 | 04201c7f96199d95b5f87714902a4da7b3a89170709d1ee12377ef3402bae066 | a867334e4be4dd842b2dfbfbac3d972a0113c00df3bc9eabfe998070b106677f | a867334e4be4dd842b2dfbfbac3d972a0113c00df3bc9eabfe998070b106677f | no |

## f7d4ea8a3516d2fc76fc80987433256fcac52df76edfc0d3ff01e3448c57baab

Message: Restore real Windows folder export for render data

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | adff697d5c158776ad8c793776767eeba56f222ed7d011131dacc7878830bae1 | adff697d5c158776ad8c793776767eeba56f222ed7d011131dacc7878830bae1 | e632f519a272beb618dc8b2370d5915eb9834925ffe55bf73d4748b5716e33aa | e632f519a272beb618dc8b2370d5915eb9834925ffe55bf73d4748b5716e33aa | no |

## caad15a25f19aa6063409178c006ec91623dc3c8598794e2d91ff2857b50c0af

Message: Request Edge write permission after selecting export folders

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | e632f519a272beb618dc8b2370d5915eb9834925ffe55bf73d4748b5716e33aa | e632f519a272beb618dc8b2370d5915eb9834925ffe55bf73d4748b5716e33aa | 21605a7bfd7522031794bf9255ce5e43335a91155f27d3d073205ae1db4b586e | 21605a7bfd7522031794bf9255ce5e43335a91155f27d3d073205ae1db4b586e | no |

## 22cee506439e25b9ccd150be81bbae20d2d69298b1b5d304b7f52e477fdebd9f

Message: Create per-document project folders before native exports

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 21605a7bfd7522031794bf9255ce5e43335a91155f27d3d073205ae1db4b586e | 21605a7bfd7522031794bf9255ce5e43335a91155f27d3d073205ae1db4b586e | 435d06716f2181b095aca72a243cfefa7e08ecdecbec8d4517c32768023b57f3 | 435d06716f2181b095aca72a243cfefa7e08ecdecbec8d4517c32768023b57f3 | no |

## 1fb9c6d9a145f62c6959c95070cc04e96b1ded16fec1548a6daa104ddcfca139

Message: Request write permission on selected parent folder

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/components/SceneDocumentsPanel.vue | 435d06716f2181b095aca72a243cfefa7e08ecdecbec8d4517c32768023b57f3 | 435d06716f2181b095aca72a243cfefa7e08ecdecbec8d4517c32768023b57f3 | e9e89511ceffd8bd3370edeecf9f1f8e99c25ed97ef63b9d7fba071525088811 | e9e89511ceffd8bd3370edeecf9f1f8e99c25ed97ef63b9d7fba071525088811 | no |

## 96162134974a041960ce82f2070ac20d927edf06f5f7780c019831acbb7f15cf

Message: Share equivalent imported surface materials independent of shader closures and source IDs; soften low roughness and stop idle resolution feedback. Passed material, raster pixel and idle scheduling tests.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/AdaptiveViewport.js | 2993e279b4659512cb4d90f26512c797b4fc3c1d47be3140d704ac7d169b1835 | 2993e279b4659512cb4d90f26512c797b4fc3c1d47be3140d704ac7d169b1835 | 263b1ed6fbe87a44ba979707ee5735f431a0f75e6b604d1fbc211b4a8b92ba72 | 263b1ed6fbe87a44ba979707ee5735f431a0f75e6b604d1fbc211b4a8b92ba72 | no |
| src/BackendPandaUIDoc.js | 3b09cde6a7b925ee6564b5a9dab83e754ea216b1e65d9fa1aa1f6608846b9558 | 3b09cde6a7b925ee6564b5a9dab83e754ea216b1e65d9fa1aa1f6608846b9558 | ab07313f5263e7544f10d8ac85149f90c7407b12088dbd4b8f4d0575572f39cf | ab07313f5263e7544f10d8ac85149f90c7407b12088dbd4b8f4d0575572f39cf | no |
| src/DisplayPipeline.js | b491e5a7d539eb20a4c28231d5512e718cc3baec9ea9f0b68dad19f4f0c31bf0 | b491e5a7d539eb20a4c28231d5512e718cc3baec9ea9f0b68dad19f4f0c31bf0 | 2d5772ed42cb2b3bde3ea25d8913c19ffbdab602aee90933c996f51907a4c5ce | 2d5772ed42cb2b3bde3ea25d8913c19ffbdab602aee90933c996f51907a4c5ce | no |
| src/render/ImportedMaterialEditor.js | b0330c65c9bb7a73c1d8ec3e2a12a9b76ba8b46b1ff1e385a60bfabf5317c347 | b0330c65c9bb7a73c1d8ec3e2a12a9b76ba8b46b1ff1e385a60bfabf5317c347 | 12857790c1ffd385f8858a311ab3c437cdb1f6517cc60fc02293bdd7548113b3 | 12857790c1ffd385f8858a311ab3c437cdb1f6517cc60fc02293bdd7548113b3 | no |
| src/render/MaterialIdentity.js | 180250b54bfb857fbfcc77b53b51f39f888bf81981cf97c5492c188d615d05a8 | 180250b54bfb857fbfcc77b53b51f39f888bf81981cf97c5492c188d615d05a8 | e57ead8fd48dda490924cca2504b3982a3cd38ef31e1ed0f2cfa5be8d3cff0c5 | e57ead8fd48dda490924cca2504b3982a3cd38ef31e1ed0f2cfa5be8d3cff0c5 | no |
| src/render/MaterialSurface.js | dab91758cdb82d0d50029b46ef0b964a2aa93b9f0c6fb70beb25ae23c993bd0b | dab91758cdb82d0d50029b46ef0b964a2aa93b9f0c6fb70beb25ae23c993bd0b | f1735766ce6f6309dfa2394f957426e7b796f58b8c57717d57ea7506fc44f87f | f1735766ce6f6309dfa2394f957426e7b796f58b8c57717d57ea7506fc44f87f | no |

## f230ba7fa6d8800e0dea3f2e67de6a14a4cd06af827f7988802d8500684084f8

Message: Include owned render/material regression tests and validation record; Preview and standalone builds, browser integration, shader pixels and release check passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/FRONTEND_SYNC.md | 6ca819de10fb516269f5e1364ad78d61f5502383a485e1e52f2503f89117c06a | 6ca819de10fb516269f5e1364ad78d61f5502383a485e1e52f2503f89117c06a | a2b029dea8080aeae2a28d77a39af6db35af69b9a0fbd35b6181f8bd8f6b15a3 | a2b029dea8080aeae2a28d77a39af6db35af69b9a0fbd35b6181f8bd8f6b15a3 | no |
| docs/RENDER_MATERIAL_FIXES.md | absent | absent | 6a7a1b358188345592c6622e54fd1f57041567380307c87c55b0b042a445a2c4 | 6a7a1b358188345592c6622e54fd1f57041567380307c87c55b0b042a445a2c4 | no |
| scripts/sync-frontend-export.cjs | 386aaa8791485da71d0444767d7d1409a6db6029b662952c281478e030943ba4 | 386aaa8791485da71d0444767d7d1409a6db6029b662952c281478e030943ba4 | 02d464e68e88324566794b5592206c07e34ba1146ead8874802a613aac9647e7 | 02d464e68e88324566794b5592206c07e34ba1146ead8874802a613aac9647e7 | no |
| scripts/test-imported-material-editor.js | absent | absent | 9df7c7d195b508a60ba05dba0ba8ce649c73d38e7eb53a2bda7b2170b9a6c025 | 9df7c7d195b508a60ba05dba0ba8ce649c73d38e7eb53a2bda7b2170b9a6c025 | no |
| scripts/test-render-idle-loop.cjs | absent | absent | 3e0c34858faa375705eb77b9b7b3e525257a7b5f1c122fc1fb01026a492b3d31 | 3e0c34858faa375705eb77b9b7b3e525257a7b5f1c122fc1fb01026a492b3d31 | no |
| scripts/test-render-raster-browser.js | absent | absent | 9c8b8ac9460d8da8f324e572af25ca2e4a0e0cb08888001433bc976de9a2f308 | 9c8b8ac9460d8da8f324e572af25ca2e4a0e0cb08888001433bc976de9a2f308 | no |
| scripts/test-render-raster-fixture.js | absent | absent | 90f1cb3fdc7677dfb6067e64d6189afce3fc06af43a0243ee6dfb0dd2c356351 | 90f1cb3fdc7677dfb6067e64d6189afce3fc06af43a0243ee6dfb0dd2c356351 | no |
| scripts/test-viewport-display-settings.js | absent | absent | c3edf5219dbac178daadbc28dab02b8cfc9de12fe412c01afdd935f2e00f77ba | c3edf5219dbac178daadbc28dab02b8cfc9de12fe412c01afdd935f2e00f77ba | no |

## 86280a95d0fbd8c4ada256b827268ddd736fded3aecc5c38ece61074a9a5b086

Message: Replace custom path tracer with isolated WebGL2 three-gpu-pathtracer; add glass refraction, textures and denoising. Validated 55 adapter/config cases, 11 physical-material cases, render-node controls and real GPU pixel/lifecycle tests.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/FRONTEND_SYNC.md | a2b029dea8080aeae2a28d77a39af6db35af69b9a0fbd35b6181f8bd8f6b15a3 | a2b029dea8080aeae2a28d77a39af6db35af69b9a0fbd35b6181f8bd8f6b15a3 | 85de3fab6044c5416162bbdb48bdb08617c135672dbeaece0306a7400eaa1a7d | 85de3fab6044c5416162bbdb48bdb08617c135672dbeaece0306a7400eaa1a7d | no |
| docs/PATH_TRACER_MIGRATION.md | absent | absent | c36442bc681b3a97a760185b0129a7e1ce32d603abd3b4c48f9a11fca61afa14 | c36442bc681b3a97a760185b0129a7e1ce32d603abd3b4c48f9a11fca61afa14 | no |
| public/editor/plugins/Render_Nodes.js | 22065438640db421dbb83bfd6c18b3de368438bd10164411ef677cacbab0203e | 22065438640db421dbb83bfd6c18b3de368438bd10164411ef677cacbab0203e | e4eb378bfa0a977e2ef62db4ec0a9df7e26316de80002476424a1307bd898593 | e4eb378bfa0a977e2ef62db4ec0a9df7e26316de80002476424a1307bd898593 | no |
| public/shared/pathtracer/434.c935c91c24df.js | absent | absent | be51e252e01d3ab3669381db8682839ade8f79b186688645b0dcf2fc454b39df | be51e252e01d3ab3669381db8682839ade8f79b186688645b0dcf2fc454b39df | no |
| public/shared/pathtracer/434.c935c91c24df.js.LICENSE.txt | absent | absent | cd43b8cb3360818a1ede143c0905ed678e9fe989253cabe6c7e2a63d4a7e9673 | cd43b8cb3360818a1ede143c0905ed678e9fe989253cabe6c7e2a63d4a7e9673 | no |
| public/shared/pathtracer/NOTICE.txt | absent | absent | a3eab8ce593eefb2e61f2f46cf74f3af7b7bc75e9ac8ad267757aa1b9dcfbe13 | a3eab8ce593eefb2e61f2f46cf74f3af7b7bc75e9ac8ad267757aa1b9dcfbe13 | no |
| public/shared/pathtracer/glslSmartDeNoise-LICENSE.txt | absent | absent | 6480c75d77eec432d9685bd557bb4267b897b83ece6c1ac6a829887a225a2115 | 6480c75d77eec432d9685bd557bb4267b897b83ece6c1ac6a829887a225a2115 | no |
| public/shared/pathtracer/runtime-manifest.json | absent | absent | 0ee9db8668af8eaa5f1f7686e36e2da3621c9309ec3d6ce625d05a8ec0ce2b83 | 0ee9db8668af8eaa5f1f7686e36e2da3621c9309ec3d6ce625d05a8ec0ce2b83 | no |
| public/shared/pathtracer/runtime.js | absent | absent | 8bcc6d4bd8d4a497154592b3ad6ce4b1d13e8290213279a524feab5df97e1613 | 8bcc6d4bd8d4a497154592b3ad6ce4b1d13e8290213279a524feab5df97e1613 | no |
| public/shared/pathtracer/runtime.js.LICENSE.txt | absent | absent | cd43b8cb3360818a1ede143c0905ed678e9fe989253cabe6c7e2a63d4a7e9673 | cd43b8cb3360818a1ede143c0905ed678e9fe989253cabe6c7e2a63d4a7e9673 | no |
| public/shared/pathtracer/three-LICENSE.txt | absent | absent | 4c40a1ef62450b857c3b2aaf294936304cd552d965fbcd9d32d4c5bcf4ba4454 | 4c40a1ef62450b857c3b2aaf294936304cd552d965fbcd9d32d4c5bcf4ba4454 | no |
| public/shared/pathtracer/three-gpu-pathtracer-LICENSE.txt | absent | absent | 2df239f3787d174fbd6ead7bc4c748bee526564aa2e67315afcae47e15552e00 | 2df239f3787d174fbd6ead7bc4c748bee526564aa2e67315afcae47e15552e00 | no |
| public/shared/pathtracer/three-mesh-bvh-LICENSE.txt | absent | absent | b106ef6198a9862ed2b5b873e944ecf3583c631a84a7462d400ecc1910ce7fee | b106ef6198a9862ed2b5b873e944ecf3583c631a84a7462d400ecc1910ce7fee | no |
| scripts/build-pathtracer-runtime.cjs | absent | absent | c91212083492526c5aa86f4af569d484a1a7155a16e67acfd5e5f771016291dc | c91212083492526c5aa86f4af569d484a1a7155a16e67acfd5e5f771016291dc | no |
| scripts/pathtracer-runtime/glslSmartDeNoise-LICENSE.txt | absent | absent | 6480c75d77eec432d9685bd557bb4267b897b83ece6c1ac6a829887a225a2115 | 6480c75d77eec432d9685bd557bb4267b897b83ece6c1ac6a829887a225a2115 | no |
| scripts/pathtracer-runtime/package-lock.json | absent | absent | d8c8a86651f371285045c1bbba3cada628914cf71fc7e343651a5969edfdbb41 | d8c8a86651f371285045c1bbba3cada628914cf71fc7e343651a5969edfdbb41 | no |
| scripts/pathtracer-runtime/package.json | absent | absent | ccebf3c967ace7d33b94bf2fbfc23c49108c1dd8c69010451d6ae337a0dbba0a | ccebf3c967ace7d33b94bf2fbfc23c49108c1dd8c69010451d6ae337a0dbba0a | no |
| scripts/pathtracer-runtime/runtime.js | absent | absent | 0f96b0b299c3a8899400f46c440f5e24d9dcc468d9e82701b773a7dd5082ad94 | 0f96b0b299c3a8899400f46c440f5e24d9dcc468d9e82701b773a7dd5082ad94 | no |
| scripts/sync-frontend-export.cjs | 02d464e68e88324566794b5592206c07e34ba1146ead8874802a613aac9647e7 | 02d464e68e88324566794b5592206c07e34ba1146ead8874802a613aac9647e7 | d655a4ac879ad8cb5ae68b88fee65af2bdead5b2092d41450fff95ab18cb7a31 | d655a4ac879ad8cb5ae68b88fee65af2bdead5b2092d41450fff95ab18cb7a31 | no |
| scripts/test-pathtrace-scene-materials.cjs | absent | absent | 92332a6b9f0fe11fc3e2173dc97f2291235658f28fe208683d8673a00bf61f16 | 92332a6b9f0fe11fc3e2173dc97f2291235658f28fe208683d8673a00bf61f16 | no |
| scripts/test-pathtracer-runtime-browser.cjs | absent | absent | adac2abd99e4501d0f5533e48c7d2e12db8779d25a2408a56a7fda57d35df8ff | adac2abd99e4501d0f5533e48c7d2e12db8779d25a2408a56a7fda57d35df8ff | no |
| scripts/test-render-nodes.js | absent | absent | d5e03b7a67a7a452d95c94dc40a9d34325baee082e638896b0f674071591f5d0 | d5e03b7a67a7a452d95c94dc40a9d34325baee082e638896b0f674071591f5d0 | no |
| scripts/test-render-pathtrace-browser.js | absent | absent | b7b4825f07d717e17d8d0d35742a3cedc145f0b8607e6dcbb5f114ebecf996c9 | b7b4825f07d717e17d8d0d35742a3cedc145f0b8607e6dcbb5f114ebecf996c9 | no |
| scripts/test-render-pathtrace.js | absent | absent | 9f8b3c7956f20527e1723a3fbe525faab0c8d54637a7343f8fc64824eeed02b1 | 9f8b3c7956f20527e1723a3fbe525faab0c8d54637a7343f8fc64824eeed02b1 | no |
| scripts/test-render-scene-adapter.js | absent | absent | c173dd0bfd74fa8e7ad30d3f3c0f49aefaeacf44c39a6de86a7e4fac220779cf | c173dd0bfd74fa8e7ad30d3f3c0f49aefaeacf44c39a6de86a7e4fac220779cf | no |
| src/render/RenderConfiguration.js | 369c85126ad063d03c9e624b95d1ee0ebf02ac6d484dbe1c42e92ec0debb3ddf | 369c85126ad063d03c9e624b95d1ee0ebf02ac6d484dbe1c42e92ec0debb3ddf | 84dc87bcabd817388fe53dd46db9a15489c5b0acbfe0b1a61bb361a80825344e | 84dc87bcabd817388fe53dd46db9a15489c5b0acbfe0b1a61bb361a80825344e | no |
| src/render/RenderEngine.js | 7bc31cbc9f618ef8bb180171546bd58c62857b5a01edc41bdb59e8e6429a7508 | 7bc31cbc9f618ef8bb180171546bd58c62857b5a01edc41bdb59e8e6429a7508 | 223f1275778e49fa5101b096934fbd88d4c348496a78791be681b75c62cd92dd | 223f1275778e49fa5101b096934fbd88d4c348496a78791be681b75c62cd92dd | no |
| src/render/RenderSceneAdapter.js | a9c05524c301443ebce62588f3ad778eae91248ebd816554e44ed3f8615797ad | a9c05524c301443ebce62588f3ad778eae91248ebd816554e44ed3f8615797ad | 22785c501afc6e8db39eab7fb57336daa68e512fef8f750dda33efe221d955c1 | 22785c501afc6e8db39eab7fb57336daa68e512fef8f750dda33efe221d955c1 | no |
| src/render/pathtrace/PathTracer.js | f0715a0e49c62483fd8e559a4eb63a4668ab0fbbd7ab362617c5018cb9ba763a | f0715a0e49c62483fd8e559a4eb63a4668ab0fbbd7ab362617c5018cb9ba763a | f85646d778abc33b8e8f2ee91006f21094f01b5b3a31feaaa432c481cd831cdf | f85646d778abc33b8e8f2ee91006f21094f01b5b3a31feaaa432c481cd831cdf | no |
| src/render/pathtrace/README.md | 0fbc4e09c87580eac89bb4ac291eae737ec20ceec128b5c65a9b2aa7e983605a | 0fbc4e09c87580eac89bb4ac291eae737ec20ceec128b5c65a9b2aa7e983605a | 75af630dbabf4700690712041733b25c8eade1dc55eca5a54d015a9c130571ad | 75af630dbabf4700690712041733b25c8eade1dc55eca5a54d015a9c130571ad | no |
| src/render/pathtrace/index.js | fb62c4704d2de6eccc6ef22c0ed9bc36020cfb803a2e1170f4e130d257a62c3c | fb62c4704d2de6eccc6ef22c0ed9bc36020cfb803a2e1170f4e130d257a62c3c | 1e40d7f3db9a9602cd283c232d76bd7273c9825ecb0d874d8e3a79815f3ad994 | 1e40d7f3db9a9602cd283c232d76bd7273c9825ecb0d874d8e3a79815f3ad994 | no |

## 8f4a666665e8bf52486036ea590042f6cd12d6e47db0179689fbf275976afb1a

Message: Finalize path tracer build inputs, document validated GPU/Preview integration and standalone builds; keep isolated dependencies independent of backend project

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/PATH_TRACER_MIGRATION.md | c36442bc681b3a97a760185b0129a7e1ce32d603abd3b4c48f9a11fca61afa14 | c36442bc681b3a97a760185b0129a7e1ce32d603abd3b4c48f9a11fca61afa14 | 9156ecf589422a975ac6f5cf385d34ff3a2ac30e7ca8244ac3c0b891baf9d7a8 | 9156ecf589422a975ac6f5cf385d34ff3a2ac30e7ca8244ac3c0b891baf9d7a8 | no |
| scripts/pathtracer-runtime/package-lock.json | d8c8a86651f371285045c1bbba3cada628914cf71fc7e343651a5969edfdbb41 | d8c8a86651f371285045c1bbba3cada628914cf71fc7e343651a5969edfdbb41 | f06a4120c12de489c16cd6847cff9dc58f614bf601c9666da44f1c55b1fdca7e | f06a4120c12de489c16cd6847cff9dc58f614bf601c9666da44f1c55b1fdca7e | no |
| scripts/pathtracer-runtime/package.json | ccebf3c967ace7d33b94bf2fbfc23c49108c1dd8c69010451d6ae337a0dbba0a | ccebf3c967ace7d33b94bf2fbfc23c49108c1dd8c69010451d6ae337a0dbba0a | b91ea51433b4019466c052401234bd80e788923f8a006eeed271729cdfcb65a6 | b91ea51433b4019466c052401234bd80e788923f8a006eeed271729cdfcb65a6 | no |
| src/render/RenderResources.md | ae2bf05e3b938c0ce5b89963a889b9af3ea9ebbe8a76de086cb5bc9d8e48e28f | ae2bf05e3b938c0ce5b89963a889b9af3ea9ebbe8a76de086cb5bc9d8e48e28f | 7e07b7edec97bcaa6550677d2991e34544c69d5b3f2c772ef25bcd74104796be | 7e07b7edec97bcaa6550677d2991e34544c69d5b3f2c772ef25bcd74104796be | no |
| src/render/pathtrace/README.md | 75af630dbabf4700690712041733b25c8eade1dc55eca5a54d015a9c130571ad | 75af630dbabf4700690712041733b25c8eade1dc55eca5a54d015a9c130571ad | a5f001928b746a68a5056af019bdd1aa02b3b79f164b25f80f48b3b5615a0711 | a5f001928b746a68a5056af019bdd1aa02b3b79f164b25f80f48b3b5615a0711 | no |

## 2e5fa6320b20f9b8f3808142946a1ee51424610bf82f01a4a878c5282b22e0a7

Message: Verify isolated runtime clean npm ci and reproducible bundle; remove stale extraneous development-root lock entry

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| scripts/pathtracer-runtime/package-lock.json | f06a4120c12de489c16cd6847cff9dc58f614bf601c9666da44f1c55b1fdca7e | f06a4120c12de489c16cd6847cff9dc58f614bf601c9666da44f1c55b1fdca7e | 7d68e476ef42cd5f7b5955ab555738b53cc068b6fa7f1ab2cb2f5abed6447cf3 | 7d68e476ef42cd5f7b5955ab555738b53cc068b6fa7f1ab2cb2f5abed6447cf3 | no |

## 9c8a913766f18e1e7bf3384db80304089a2455b3c65e9e6ab0e2f17d9660db37

Message: Fix opaque reflective surface occlusion and mirror coverage; use depth-dependent frosting with owned depth targets. Validated 106 GPU checks on WebGL2 and WebGL1 plus material/resource regressions.

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 6a7a1b358188345592c6622e54fd1f57041567380307c87c55b0b042a445a2c4 | 6a7a1b358188345592c6622e54fd1f57041567380307c87c55b0b042a445a2c4 | 30cfbaa9fa39b81ce23da8ca3480021f1dc29e94a3d503acd898d4703dd64cb9 | 30cfbaa9fa39b81ce23da8ca3480021f1dc29e94a3d503acd898d4703dd64cb9 | no |
| scripts/test-render-raster-browser.js | 9c8b8ac9460d8da8f324e572af25ca2e4a0e0cb08888001433bc976de9a2f308 | 9c8b8ac9460d8da8f324e572af25ca2e4a0e0cb08888001433bc976de9a2f308 | bd37ea720e6c0238a1420dbb24beda75ad6802b89e692b31a6bdc0686f97634b | bd37ea720e6c0238a1420dbb24beda75ad6802b89e692b31a6bdc0686f97634b | no |
| scripts/test-render-raster-fixture.js | 90f1cb3fdc7677dfb6067e64d6189afce3fc06af43a0243ee6dfb0dd2c356351 | 90f1cb3fdc7677dfb6067e64d6189afce3fc06af43a0243ee6dfb0dd2c356351 | 75e747343dea83598c3c2d62a640cd2a784eee2e2bc6cf9d51b363f790f7968d | 75e747343dea83598c3c2d62a640cd2a784eee2e2bc6cf9d51b363f790f7968d | no |
| src/render/MaterialRefractionPass.js | 31fdfe63659db3688165426b979781c597cd9852ad5a7eab14e520493ab10c15 | 31fdfe63659db3688165426b979781c597cd9852ad5a7eab14e520493ab10c15 | 468060f29d8e9e29cef8c255fdb255e568b1f6580356c30089acd2a0ddd2f957 | 468060f29d8e9e29cef8c255fdb255e568b1f6580356c30089acd2a0ddd2f957 | no |
| src/render/MaterialSurface.js | f1735766ce6f6309dfa2394f957426e7b796f58b8c57717d57ea7506fc44f87f | f1735766ce6f6309dfa2394f957426e7b796f58b8c57717d57ea7506fc44f87f | 4fd012f3703d7bfec2a428f544b6f95a5098d2c79500815f47d8bdfe62593276 | 4fd012f3703d7bfec2a428f544b6f95a5098d2c79500815f47d8bdfe62593276 | no |

## d944b9367ef840e808a7468c49539930614c1e5425c5b05f2238ce040aa8a42b

Message: Record completed real-time optics validation: Preview production browser integration, standalone build and release checks passed

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 30cfbaa9fa39b81ce23da8ca3480021f1dc29e94a3d503acd898d4703dd64cb9 | 30cfbaa9fa39b81ce23da8ca3480021f1dc29e94a3d503acd898d4703dd64cb9 | b48b7befead299da2409a055ead4009f102d468a4ae9979f218fef762fdf7ca6 | b48b7befead299da2409a055ead4009f102d468a4ae9979f218fef762fdf7ca6 | no |

## e68362bd1f0d7f7b0888a41bbb56d4ff28f64d39e6529897dd1fb1ac5e5576a8

Message: Stabilize reflections and transparent frosted layers

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | 468060f29d8e9e29cef8c255fdb255e568b1f6580356c30089acd2a0ddd2f957 | 468060f29d8e9e29cef8c255fdb255e568b1f6580356c30089acd2a0ddd2f957 | e28c7551cde7cedcbaabb9174d9976824a770a7e6320acba51bfcc87455e5722 | e28c7551cde7cedcbaabb9174d9976824a770a7e6320acba51bfcc87455e5722 | no |
| src/render/RasterRenderer.js | fbbb07cf250570166d425fc2300e87cf84d6c556af334488d38fc96bb4acfb0e | fbbb07cf250570166d425fc2300e87cf84d6c556af334488d38fc96bb4acfb0e | 002c50c481846526df33e5fa2b8da2324282b6708724094e6a75982e0d668aa5 | 002c50c481846526df33e5fa2b8da2324282b6708724094e6a75982e0d668aa5 | no |
| src/render/StudioFloor.js | 84a672b86fa41c3a732a80b226f0a00c27bb2f33ef3afbef039197b84146c7e7 | 84a672b86fa41c3a732a80b226f0a00c27bb2f33ef3afbef039197b84146c7e7 | 1462dbe3393e740f6134b72218cb93b06ad8effe9be13e77563f1f1d6d02dd74 | 1462dbe3393e740f6134b72218cb93b06ad8effe9be13e77563f1f1d6d02dd74 | no |

## b0c5cf080381673b5d196ba5d83b1964762056555d9508feafc845bbd1c5780a

Message: Layer ordinary transparent materials behind frosted surfaces

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | e28c7551cde7cedcbaabb9174d9976824a770a7e6320acba51bfcc87455e5722 | e28c7551cde7cedcbaabb9174d9976824a770a7e6320acba51bfcc87455e5722 | 7b7539aad256e836af8aea05864e2fe52e3d30d224f694f02ad6a8f9c1551cbc | 7b7539aad256e836af8aea05864e2fe52e3d30d224f694f02ad6a8f9c1551cbc | no |

## 52308865bd893864263c638cb3e65e97806f9439884b8b41cde52fc3dcc2830f

Message: Isolate floor reflection capture from optical bindings

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/StudioFloor.js | 1462dbe3393e740f6134b72218cb93b06ad8effe9be13e77563f1f1d6d02dd74 | 1462dbe3393e740f6134b72218cb93b06ad8effe9be13e77563f1f1d6d02dd74 | 0de26c24deffea6caa9bcc73c7bd9ec8560afb17209a820bb81033149e1e93ed | 0de26c24deffea6caa9bcc73c7bd9ec8560afb17209a820bb81033149e1e93ed | no |

## 5e8db97068f268133fc11346ee2ea2d6dc78a48030b525a457f0b5c4c234c549

Message: Restore validated glass layering and isolate floor reflection capture

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | 7b7539aad256e836af8aea05864e2fe52e3d30d224f694f02ad6a8f9c1551cbc | 7b7539aad256e836af8aea05864e2fe52e3d30d224f694f02ad6a8f9c1551cbc | e5aa7d77d5198836d53d5d17978361daf15016a4f32cb577cee4d78bc58bc6bf | e5aa7d77d5198836d53d5d17978361daf15016a4f32cb577cee4d78bc58bc6bf | no |
| src/render/RasterRenderer.js | 002c50c481846526df33e5fa2b8da2324282b6708724094e6a75982e0d668aa5 | 002c50c481846526df33e5fa2b8da2324282b6708724094e6a75982e0d668aa5 | 931de2256ce7cd44ef03e7083f9fa713e885f84b475dfbe4a781c09183134d0c | 931de2256ce7cd44ef03e7083f9fa713e885f84b475dfbe4a781c09183134d0c | no |

## 393c57cf0929656bda6693592bce6a7d1ce9ac670a0baeb222f7b29b294f5a5a

Message: Prevent double blending of captured glass transmission

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialSurface.js | 4fd012f3703d7bfec2a428f544b6f95a5098d2c79500815f47d8bdfe62593276 | 4fd012f3703d7bfec2a428f544b6f95a5098d2c79500815f47d8bdfe62593276 | 8fd36c1777bf0db4e7b16d2dd19fbca172a5b9ec7e3777d07331fde50b698cdd | 8fd36c1777bf0db4e7b16d2dd19fbca172a5b9ec7e3777d07331fde50b698cdd | no |

## e32fdc107cae2b190eb000c0bf1366c7f3e814e4c0f39696a33f46305177d368

Message: Prevent double blending of captured glass transmission

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialSurface.js | 8fd36c1777bf0db4e7b16d2dd19fbca172a5b9ec7e3777d07331fde50b698cdd | 8fd36c1777bf0db4e7b16d2dd19fbca172a5b9ec7e3777d07331fde50b698cdd | fe97178e02b629eb8839d166dfcc5cbd9bd93fd32a903b1bd9702c7e4c269a64 | fe97178e02b629eb8839d166dfcc5cbd9bd93fd32a903b1bd9702c7e4c269a64 | no |

## c92d7650860d0de803ea137a657ab224a822173df7e55d012e0f58ed0fbeda10

Message: Prevent double blending of captured glass transmission

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialSurface.js | fe97178e02b629eb8839d166dfcc5cbd9bd93fd32a903b1bd9702c7e4c269a64 | fe97178e02b629eb8839d166dfcc5cbd9bd93fd32a903b1bd9702c7e4c269a64 | d151c0a2d71140a1316d5888135bc40094d8fe6d81b5452dad5d3236b1144f45 | d151c0a2d71140a1316d5888135bc40094d8fe6d81b5452dad5d3236b1144f45 | no |

## c376dffddd70aa6a3cbbd707713e2af35a56e7a796df4216b907733f43aa5aa2

Message: Document and export the captured transmission alpha fix

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | b48b7befead299da2409a055ead4009f102d468a4ae9979f218fef762fdf7ca6 | b48b7befead299da2409a055ead4009f102d468a4ae9979f218fef762fdf7ca6 | 79f131baf3206d6c3d2cc89f460e34b1584e0086db5b37b7c1c645fd83b46ad6 | 79f131baf3206d6c3d2cc89f460e34b1584e0086db5b37b7c1c645fd83b46ad6 | no |

## 8a6d056b92281c2d279c0e1f23798d0a693decdfa88a543ff5d56c2f77b84ccf

Message: Separate overlapping glass panes into depth-aware transmission bands

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| src/render/MaterialRefractionPass.js | e5aa7d77d5198836d53d5d17978361daf15016a4f32cb577cee4d78bc58bc6bf | e5aa7d77d5198836d53d5d17978361daf15016a4f32cb577cee4d78bc58bc6bf | 6e672a3bf21d5976535cd549e75c3aeb207296180703ae71bb71759f3346009d | 6e672a3bf21d5976535cd549e75c3aeb207296180703ae71bb71759f3346009d | no |

## e4e6380580df93bb3bc47474d5ad16c298f6f9bfea3a2b64decc797db8b098a0

Message: Document and export depth-aware overlapping glass bands

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 79f131baf3206d6c3d2cc89f460e34b1584e0086db5b37b7c1c645fd83b46ad6 | 79f131baf3206d6c3d2cc89f460e34b1584e0086db5b37b7c1c645fd83b46ad6 | 9525583115b136d1b17d4ed4f40388218f66aa031fd5871413aa460a330ca91e | 9525583115b136d1b17d4ed4f40388218f66aa031fd5871413aa460a330ca91e | no |

## d5310775df93add5a294221f99708130ed76584be2949ae53ec5d88c8b8f016d

Message: Sync eight-layer overlapping glass composition and documentation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 9525583115b136d1b17d4ed4f40388218f66aa031fd5871413aa460a330ca91e | 9525583115b136d1b17d4ed4f40388218f66aa031fd5871413aa460a330ca91e | 2eda6e1a217f9a6bf8a78533d239f6aae288226734c66869ddde14f0e1e73f3e | 2eda6e1a217f9a6bf8a78533d239f6aae288226734c66869ddde14f0e1e73f3e | no |
| src/render/MaterialRefractionPass.js | 6e672a3bf21d5976535cd549e75c3aeb207296180703ae71bb71759f3346009d | 6e672a3bf21d5976535cd549e75c3aeb207296180703ae71bb71759f3346009d | 68e9b534b182b19b1fa51c20d2564efe4d7f20c2f90b829a6a70753abcced44a | 68e9b534b182b19b1fa51c20d2564efe4d7f20c2f90b829a6a70753abcced44a | no |
| src/render/STUDIO_RENDERING.md | 2dae05337aa05d3291cb0dbbef9cf1a6a327b366eabb145593600c0721a894de | 2dae05337aa05d3291cb0dbbef9cf1a6a327b366eabb145593600c0721a894de | 975df87ca8d903cc194f242d657474dafdd12992b88067b9d38b9be442b967bc | 975df87ca8d903cc194f242d657474dafdd12992b88067b9d38b9be442b967bc | no |

## 79d2e6319e983f6ae02ddb990cdd2389a7062b7f0c0572a774de11244005fb2f

Message: Fix final glass depth occlusion and partial-overlap band dependencies; WebGL1/2 114 checks pass

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 2eda6e1a217f9a6bf8a78533d239f6aae288226734c66869ddde14f0e1e73f3e | 2eda6e1a217f9a6bf8a78533d239f6aae288226734c66869ddde14f0e1e73f3e | 97c3d74830fe3c235a66e0b9e7e2a22a04ac97c0eca3bb1a94d6a2ef0232bdff | 97c3d74830fe3c235a66e0b9e7e2a22a04ac97c0eca3bb1a94d6a2ef0232bdff | no |
| src/render/MaterialRefractionPass.js | 68e9b534b182b19b1fa51c20d2564efe4d7f20c2f90b829a6a70753abcced44a | 68e9b534b182b19b1fa51c20d2564efe4d7f20c2f90b829a6a70753abcced44a | b59a3c0831c966cdaf77d907e98f9cfb4b3afe7fc31d1acd2c5645aa317d8bad | b59a3c0831c966cdaf77d907e98f9cfb4b3afe7fc31d1acd2c5645aa317d8bad | no |

## fcab7fa5db85523e34603805df75569587132e8395068bca9e26de1f99723717

Message: Record completed foreground frosting pixel, build and Preview browser validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 97c3d74830fe3c235a66e0b9e7e2a22a04ac97c0eca3bb1a94d6a2ef0232bdff | 97c3d74830fe3c235a66e0b9e7e2a22a04ac97c0eca3bb1a94d6a2ef0232bdff | 3f9ff10a8042dedc1f5d18b9e01a053b930280612c76f11a7e85d5ee8a3dd70b | 3f9ff10a8042dedc1f5d18b9e01a053b930280612c76f11a7e85d5ee8a3dd70b | no |

## 2d7b0a4164124044a1037706deb50989a347dfe4c64637274155ebe7ee4c25b4

Message: Fix mirrored glass capture, strengthen depth precision and persist editable material library

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 3f9ff10a8042dedc1f5d18b9e01a053b930280612c76f11a7e85d5ee8a3dd70b | 3f9ff10a8042dedc1f5d18b9e01a053b930280612c76f11a7e85d5ee8a3dd70b | 1dfdcf4f6c69ee1075320683ae87c4aef860dc0c11e2cdb04c4acc3000ba6eea | 1dfdcf4f6c69ee1075320683ae87c4aef860dc0c11e2cdb04c4acc3000ba6eea | no |
| scripts/test-imported-material-editor.js | 9df7c7d195b508a60ba05dba0ba8ce649c73d38e7eb53a2bda7b2170b9a6c025 | 9df7c7d195b508a60ba05dba0ba8ce649c73d38e7eb53a2bda7b2170b9a6c025 | 2d5a80252cce0f6c56c4e4fa3e593ad4f0eefd7e546ef2c8b853836ba1d405f4 | 2d5a80252cce0f6c56c4e4fa3e593ad4f0eefd7e546ef2c8b853836ba1d405f4 | no |
| scripts/test-render-raster-fixture.js | 75e747343dea83598c3c2d62a640cd2a784eee2e2bc6cf9d51b363f790f7968d | 75e747343dea83598c3c2d62a640cd2a784eee2e2bc6cf9d51b363f790f7968d | 10af4191f7269887c598f61f60c78535a8777a93f13fc20b4558fb56fd0ed52b | 10af4191f7269887c598f61f60c78535a8777a93f13fc20b4558fb56fd0ed52b | no |
| src/DisplayPipeline.js | 2d5772ed42cb2b3bde3ea25d8913c19ffbdab602aee90933c996f51907a4c5ce | 2d5772ed42cb2b3bde3ea25d8913c19ffbdab602aee90933c996f51907a4c5ce | 1e64e2bff22950f5768b4becaf29a33c3eaa6d07f87c84c40e767559c3cf3af0 | 1e64e2bff22950f5768b4becaf29a33c3eaa6d07f87c84c40e767559c3cf3af0 | no |
| src/collaboration/SceneDisplayPacket.js | 1a3ca656aa27e945ad20b1088e2247eb699242db73dd5bf8fd7b5852049743a7 | 1a3ca656aa27e945ad20b1088e2247eb699242db73dd5bf8fd7b5852049743a7 | 099a16d1fdca4e91e1ef0dfe02f1d04123031499f3d4aae7004a041fd19dfac8 | 099a16d1fdca4e91e1ef0dfe02f1d04123031499f3d4aae7004a041fd19dfac8 | no |
| src/render/ImportedMaterialEditor.js | 12857790c1ffd385f8858a311ab3c437cdb1f6517cc60fc02293bdd7548113b3 | 12857790c1ffd385f8858a311ab3c437cdb1f6517cc60fc02293bdd7548113b3 | 2b415e88bdcd37c60e94f4167e0c2bee84070d87a1e1115b6a7e9698fa2e4668 | 2b415e88bdcd37c60e94f4167e0c2bee84070d87a1e1115b6a7e9698fa2e4668 | no |
| src/render/MaterialRefractionPass.js | b59a3c0831c966cdaf77d907e98f9cfb4b3afe7fc31d1acd2c5645aa317d8bad | b59a3c0831c966cdaf77d907e98f9cfb4b3afe7fc31d1acd2c5645aa317d8bad | ad0e60982c814a5d2448d5ba8afda01aa30663894809d1deee0231e2fe32253e | ad0e60982c814a5d2448d5ba8afda01aa30663894809d1deee0231e2fe32253e | no |
| src/render/StudioFloor.js | 0de26c24deffea6caa9bcc73c7bd9ec8560afb17209a820bb81033149e1e93ed | 0de26c24deffea6caa9bcc73c7bd9ec8560afb17209a820bb81033149e1e93ed | 133d69785ba1f3adeb46f1ca5072ce6e35422364a0c9635950ac8a52d23b0efb | 133d69785ba1f3adeb46f1ca5072ce6e35422364a0c9635950ac8a52d23b0efb | no |
| src/storage/LocalDocumentArchive.js | b1bc96e7db6427aab29935ec517ddc700733f36e245421fb02a6738a93415b62 | b1bc96e7db6427aab29935ec517ddc700733f36e245421fb02a6738a93415b62 | a0f847195c5fd8c9171b7538b6583dbf72e12d5dd2f419f5b03f26288cebbe92 | a0f847195c5fd8c9171b7538b6583dbf72e12d5dd2f419f5b03f26288cebbe92 | no |

## 5e4d74d91c0244ff6df772ca0adc5683a01ff8b49048a8c8fb10e4e719e174f4

Message: Keep authored ground mirror stable alongside reflective bodies; compose mirrored glass and release unused captures

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 1dfdcf4f6c69ee1075320683ae87c4aef860dc0c11e2cdb04c4acc3000ba6eea | 1dfdcf4f6c69ee1075320683ae87c4aef860dc0c11e2cdb04c4acc3000ba6eea | 2d7f81d827f36ac3812d863dc0569a9c97db6620c1e6423d5c27fd19295b0b84 | 2d7f81d827f36ac3812d863dc0569a9c97db6620c1e6423d5c27fd19295b0b84 | no |
| scripts/test-render-raster-fixture.js | 10af4191f7269887c598f61f60c78535a8777a93f13fc20b4558fb56fd0ed52b | 10af4191f7269887c598f61f60c78535a8777a93f13fc20b4558fb56fd0ed52b | 22c11c66fafc502ca60f0637866b2b887ef6d1d14c3f80020e96ec2dd772d9f8 | 22c11c66fafc502ca60f0637866b2b887ef6d1d14c3f80020e96ec2dd772d9f8 | no |
| src/render/MaterialRefractionPass.js | ad0e60982c814a5d2448d5ba8afda01aa30663894809d1deee0231e2fe32253e | ad0e60982c814a5d2448d5ba8afda01aa30663894809d1deee0231e2fe32253e | e4c03c7d5741967f3e740f14bc91ccf41a6de7dc1525985d9c3f0a5d26c48d11 | e4c03c7d5741967f3e740f14bc91ccf41a6de7dc1525985d9c3f0a5d26c48d11 | no |

## c6240a2d8db0020b1a1f030e717c1ca24aee255301b5597138a7163ddd1b7c1d

Message: Record final browser, optical, build and release validation for material library and mirror fixes

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 2d7f81d827f36ac3812d863dc0569a9c97db6620c1e6423d5c27fd19295b0b84 | 2d7f81d827f36ac3812d863dc0569a9c97db6620c1e6423d5c27fd19295b0b84 | dab607a5b2f8446e2f361a4b816f4dcf2d7458ac90805de4f4b63e976a3ad429 | dab607a5b2f8446e2f361a4b816f4dcf2d7458ac90805de4f4b63e976a3ad429 | no |

## 530b6b6e7370741891994c1b2f572a0a13c2888f7d4e998c6744da29a1d3b408

Message: Require matching material names as well as appearance before merging

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | dab607a5b2f8446e2f361a4b816f4dcf2d7458ac90805de4f4b63e976a3ad429 | dab607a5b2f8446e2f361a4b816f4dcf2d7458ac90805de4f4b63e976a3ad429 | 139294dea5f609624bec60acfd0714b1543da641d1225dba1c4a163e8204d7fb | 139294dea5f609624bec60acfd0714b1543da641d1225dba1c4a163e8204d7fb | no |
| scripts/test-imported-material-editor.js | 2d5a80252cce0f6c56c4e4fa3e593ad4f0eefd7e546ef2c8b853836ba1d405f4 | 2d5a80252cce0f6c56c4e4fa3e593ad4f0eefd7e546ef2c8b853836ba1d405f4 | b63b009b1e099ddfb46f68b9c5717a656647a6c0065d31bbf3358a6db0e03275 | b63b009b1e099ddfb46f68b9c5717a656647a6c0065d31bbf3358a6db0e03275 | no |
| src/BackendPandaUIDoc.js | ab07313f5263e7544f10d8ac85149f90c7407b12088dbd4b8f4d0575572f39cf | ab07313f5263e7544f10d8ac85149f90c7407b12088dbd4b8f4d0575572f39cf | 13605c7e9d9d8d1327edf2c3f18d6fc7148a0bbf3ef9351566e0f9b36c96c15c | 13605c7e9d9d8d1327edf2c3f18d6fc7148a0bbf3ef9351566e0f9b36c96c15c | no |
| src/render/MaterialIdentity.js | e57ead8fd48dda490924cca2504b3982a3cd38ef31e1ed0f2cfa5be8d3cff0c5 | e57ead8fd48dda490924cca2504b3982a3cd38ef31e1ed0f2cfa5be8d3cff0c5 | 74eb6ba360f89bb0642dbb9ec5956d42450f92c345a7bb35485794c815db65b6 | 74eb6ba360f89bb0642dbb9ec5956d42450f92c345a7bb35485794c815db65b6 | no |

## 996725b6b19b48f088a265727b279b50843b7dc5780998f99307e6f6a3286c52

Message: Record material-name validation and Preview-only case-folder saving behavior

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 139294dea5f609624bec60acfd0714b1543da641d1225dba1c4a163e8204d7fb | 139294dea5f609624bec60acfd0714b1543da641d1225dba1c4a163e8204d7fb | 59fccd2b806c56e02b9a0e4dc24e7ad80813182b0c4e875ab6ca99435a2eb44d | 59fccd2b806c56e02b9a0e4dc24e7ad80813182b0c4e875ab6ca99435a2eb44d | no |

## a5ff2793df4c308a58b7bcdc9c1579f0cef8e3187c1d9e832eed1de8e3c249fd

Message: Record verified built-in case save/reopen and persistent folder reuse

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 59fccd2b806c56e02b9a0e4dc24e7ad80813182b0c4e875ab6ca99435a2eb44d | 59fccd2b806c56e02b9a0e4dc24e7ad80813182b0c4e875ab6ca99435a2eb44d | d0f073ae9413c8e6882f19b9d0ed5d517f82346f2223f996743c2da888670a69 | d0f073ae9413c8e6882f19b9d0ed5d517f82346f2223f996743c2da888670a69 | no |

## 6c63e97546a03b7f498ca2dbd70f31ba7af540d385d52b3caffa27542543fc1a

Message: Document Preview folder permission staging and retained-handle retries

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | d0f073ae9413c8e6882f19b9d0ed5d517f82346f2223f996743c2da888670a69 | d0f073ae9413c8e6882f19b9d0ed5d517f82346f2223f996743c2da888670a69 | 9a410ac332d11702e14fe012cbac20f190ee3e5857c2579b7f9dc5fba5158417 | 9a410ac332d11702e14fe012cbac20f190ee3e5857c2579b7f9dc5fba5158417 | no |

## 81e49d7c8b5cff3cf31a2d22708cad933371c6d4873e05d02ae16799b6f87bb5

Message: Record passing Preview authorization retry and archive regression

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 9a410ac332d11702e14fe012cbac20f190ee3e5857c2579b7f9dc5fba5158417 | 9a410ac332d11702e14fe012cbac20f190ee3e5857c2579b7f9dc5fba5158417 | fc33d9663dd28c01dd7074aaf17e8f4095f37e982536bb818b84f929088eaf3e | fc33d9663dd28c01dd7074aaf17e8f4095f37e982536bb818b84f929088eaf3e | no |

## 99921c0a9f5f32e6aa5be953989d7031f157e507049598d9984d2cd86a087779

Message: Preserve per-pixel background depth through glass for distance-dependent frosting

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | fc33d9663dd28c01dd7074aaf17e8f4095f37e982536bb818b84f929088eaf3e | fc33d9663dd28c01dd7074aaf17e8f4095f37e982536bb818b84f929088eaf3e | 23f72e66149f13eca6e72b56d40860d9f9b09ada7eff4eee91db460a9ee19c0f | 23f72e66149f13eca6e72b56d40860d9f9b09ada7eff4eee91db460a9ee19c0f | no |
| scripts/test-render-raster-fixture.js | 22c11c66fafc502ca60f0637866b2b887ef6d1d14c3f80020e96ec2dd772d9f8 | 22c11c66fafc502ca60f0637866b2b887ef6d1d14c3f80020e96ec2dd772d9f8 | 490fd8c54e78ba8f347eb0ea38c0ded6e469b6a670c1062b5f0d372f0431a9a6 | 490fd8c54e78ba8f347eb0ea38c0ded6e469b6a670c1062b5f0d372f0431a9a6 | no |
| src/render/MaterialRefractionPass.js | e4c03c7d5741967f3e740f14bc91ccf41a6de7dc1525985d9c3f0a5d26c48d11 | e4c03c7d5741967f3e740f14bc91ccf41a6de7dc1525985d9c3f0a5d26c48d11 | 03a04d661650b2a0ef785f3e5db41fb0527b19d1f158b4d684a35d5ee779424a | 03a04d661650b2a0ef785f3e5db41fb0527b19d1f158b4d684a35d5ee779424a | no |

## 8931397e7951eb5604dbab45906576e3a6f0dcc89e9ba9c7e79c044c508ab34e

Message: Record per-pixel frost validation and three-project build results

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 23f72e66149f13eca6e72b56d40860d9f9b09ada7eff4eee91db460a9ee19c0f | 23f72e66149f13eca6e72b56d40860d9f9b09ada7eff4eee91db460a9ee19c0f | c6cb909f7d17417d2e958f961e4a32939fcba674f106c61f651b7cd21c1251df | c6cb909f7d17417d2e958f961e4a32939fcba674f106c61f651b7cd21c1251df | no |

## 938712953c12726385a275ea128e4195a559c1c4d8758eb23e0b2b25d93a9fbd

Message: Calibrate per-pixel frosted transmission gradient and expose reference distance without shifting node ports

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | c6cb909f7d17417d2e958f961e4a32939fcba674f106c61f651b7cd21c1251df | c6cb909f7d17417d2e958f961e4a32939fcba674f106c61f651b7cd21c1251df | 78522d64dd4b300c64effb85e0acabc716c05370c0c7773bde70d32517aa893a | 78522d64dd4b300c64effb85e0acabc716c05370c0c7773bde70d32517aa893a | no |
| public/editor/plugins/Material_Nodes.js | 9d0eff76fa3c8440e63da81d7699c76db93a17468f64e047105b0c3223434198 | 9d0eff76fa3c8440e63da81d7699c76db93a17468f64e047105b0c3223434198 | e2ef96ccf73c9d3264a257f4e716930d236329aa2fd57e5a4dccbd90ded6cb76 | e2ef96ccf73c9d3264a257f4e716930d236329aa2fd57e5a4dccbd90ded6cb76 | no |
| public/editor/shared/MaterialSchema.js | ed0a2ec586bdc7dc95cada709aac6645e632228db5450d315b30f8ca486cca53 | ed0a2ec586bdc7dc95cada709aac6645e632228db5450d315b30f8ca486cca53 | c6c10858fe7dd38ba4b20a400a70efaef97ec7cf39ab0f709770c73dc04fca63 | c6c10858fe7dd38ba4b20a400a70efaef97ec7cf39ab0f709770c73dc04fca63 | no |
| scripts/test-render-raster-fixture.js | 490fd8c54e78ba8f347eb0ea38c0ded6e469b6a670c1062b5f0d372f0431a9a6 | 490fd8c54e78ba8f347eb0ea38c0ded6e469b6a670c1062b5f0d372f0431a9a6 | 7737cab0e921817a9febb28ee0c5caeac9c99ef667124f7854b6f98a43aaa440 | 7737cab0e921817a9febb28ee0c5caeac9c99ef667124f7854b6f98a43aaa440 | no |
| src/BackendPandaUIDoc.js | 13605c7e9d9d8d1327edf2c3f18d6fc7148a0bbf3ef9351566e0f9b36c96c15c | 13605c7e9d9d8d1327edf2c3f18d6fc7148a0bbf3ef9351566e0f9b36c96c15c | 49aff12959a73ba5a2cc2e9263d657aaea159dafd36dffe7ffa0a20fd7d86060 | 49aff12959a73ba5a2cc2e9263d657aaea159dafd36dffe7ffa0a20fd7d86060 | no |
| src/render/MaterialSurface.js | d151c0a2d71140a1316d5888135bc40094d8fe6d81b5452dad5d3236b1144f45 | d151c0a2d71140a1316d5888135bc40094d8fe6d81b5452dad5d3236b1144f45 | 24f3887a3edf89b99f72b34f91720c433869d129b51bfb52a8ca347e0c02f312 | 24f3887a3edf89b99f72b34f91720c433869d129b51bfb52a8ca347e0c02f312 | no |

## 1afe707cf848fedeaf6e3bda282e5a7053f435e2afdc03f845775b462253d995

Message: Record calibrated frost gradient build, save-roundtrip and runtime validation

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| docs/RENDER_MATERIAL_FIXES.md | 78522d64dd4b300c64effb85e0acabc716c05370c0c7773bde70d32517aa893a | 78522d64dd4b300c64effb85e0acabc716c05370c0c7773bde70d32517aa893a | bb3a40da4144ee6803df5f472be2d26b1b32340d9120952b312b65bd441cd02f | bb3a40da4144ee6803df5f472be2d26b1b32340d9120952b312b65bd441cd02f | no |

## 658eca6396cb644ae2a73a0b8f9ddb705227cebeeffa0795927c701d7d007617

Message: Include layered-glass regression screenshot capture

| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |
| --- | --- | --- | --- | --- | --- |
| scripts/test-render-raster-browser.js | bd37ea720e6c0238a1420dbb24beda75ad6802b89e692b31a6bdc0686f97634b | bd37ea720e6c0238a1420dbb24beda75ad6802b89e692b31a6bdc0686f97634b | 0b1b84eb7d0e7164d17e25538bd3732433cb1ee19d3c531f933d9c5fcab05cb0 | 0b1b84eb7d0e7164d17e25538bd3732433cb1ee19d3c531f933d9c5fcab05cb0 | no |
