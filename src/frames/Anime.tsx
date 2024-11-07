import CanvasComponent, { extractCanvasProps } from '../blocks/CanvasComponent'
import { ChildComponent, FrameComponent } from '../blocks/FrameChildComponents'
import { omit } from 'lodash'
import {
  Children,
  forwardRef,
  useEffect,
  useRef,
  useState,
  RefObject,
  MutableRefObject
} from 'react'
import regl from 'regl'
import { CanvasComponentProps, ChildProps, ParentProps } from '../types'
import {
  useAnimate,
  scroll,
  animate,
  DynamicAnimationOptions,
  AnimationPlaybackControls,
  useScroll,
  AnimationSequence,
  Segment,
  DOMKeyframesDefinition,
  MotionValueSegment,
  DOMSegment,
  MotionValueSegmentWithTransition,
  DOMSegmentWithTransition,
  SequenceLabel,
  SequenceLabelWithTime,
  motion,
  At,
  useMotionValue,
  MotionValue
} from 'framer-motion'
import invariant from 'tiny-invariant'
import anime, {
  AnimeAnimParams,
  AnimeTimelineAnimParams,
  AnimeTimelineInstance
} from 'animejs'

const Anime = (
  props: ParentProps<
    { className?: string; parameters?: AnimeTimelineAnimParams },
    MutableRefObject<AnimeTimelineInstance>
  >
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null!)

  const animControls = useRef<AnimeTimelineInstance>(
    anime.timeline(props.parameters)
  )
  const { scrollYProgress } = useScroll()

  scrollYProgress.on('change', y => {
    if (!animControls.current) return
    animControls.current.seek(y * animControls.current.duration)
  })

  return (
    <>
      <CanvasComponent
        ref={canvasRef}
        {...extractCanvasProps({ ...props, type: 'webgl2' })}
        webgl
      />
      <FrameComponent
        options={{
          ...omit(props, 'children'),
          setup: (self, ctx) => {
            if (!(props.children instanceof Array)) return
            animControls.current = anime.timeline(props.parameters)
            props.children.forEach((x, i) => {
              animControls.current.add(
                { ...x.props.parameters, targets: ctx.elements[x.props.name] },
                x.props.offset
              )
            })
            animControls.current.pause()
            if (props.setup) props.setup(self, ctx)
          }
        }}
        getSelf={options => {
          return animControls
        }}>
        <div className={props.className}>{props.children}</div>
      </FrameComponent>
    </>
  )
}

export const AnimeDiv = (
  props: ChildProps<
    {
      parameters: AnimeAnimParams
      offset?: string | number
      className?: string
    },
    HTMLDivElement,
    {}
  >
) => {
  const thisRef = useRef<HTMLDivElement>(null!)
  return (
    <>
      <ChildComponent
        options={props}
        getSelf={() => {
          return thisRef.current
        }}>
        <div className={props.className} ref={thisRef}>
          {props.children}
        </div>
      </ChildComponent>
    </>
  )
}

export const AnimeObject = <T extends Record<string, any>>(
  props: ChildProps<
    {
      target: T
      parameters: AnimeAnimParams
      offset?: string | number
    },
    T,
    {}
  >
) => {
  const initialObject = useRef<T>(props.target)
  return (
    <ChildComponent
      options={props}
      getSelf={() => {
        return initialObject.current
      }}
    />
  )
}

export default Anime
