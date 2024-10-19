import {
  ChildComponent,
  defineChildComponent,
  defineFrameComponent,
  FrameComponent,
  Reactive
} from './blocks/FrameChildComponents'
import Anime, { AnimeDiv, AnimeObject } from './frames/Anime'
import AudioCtx from './frames/AudioCtx'
import Call from './frames/Call'
import CameraInput from './frames/CameraInput'
import Canvas2D from './frames/Canvas2D'
import Elementary from './frames/Elementary'
import FramerSequence, {
  FramerDiv,
  FramerObject,
  FramerValue
} from './frames/FramerMotion'
import Hydra from './frames/Hydra'
import Processing from './frames/Processing'
import Regl from './frames/Regl'
import ScrollProgress from './frames/ScrollProgress'
import Snap from './frames/Snap'
import Svg from './frames/Svg'
import { compileFragmentShader } from './utilities/shaderGeneration/index'

export {
  Anime,
  AnimeDiv,
  AnimeObject,
  AudioCtx,
  Call,
  CameraInput,
  Canvas2D,
  ChildComponent,
  defineChildComponent,
  defineFrameComponent,
  Elementary,
  FrameComponent,
  FramerDiv,
  FramerSequence as FramerMotion,
  FramerObject,
  FramerValue,
  Hydra,
  Processing,
  Reactive,
  Regl,
  ScrollProgress,
  Snap,
  Svg
}

export { compileFragmentShader }
