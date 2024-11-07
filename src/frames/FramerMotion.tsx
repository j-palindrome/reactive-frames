import CanvasComponent, { extractCanvasProps } from '../blocks/CanvasComponent'
import { ChildComponent, FrameComponent } from '../blocks/FrameChildComponents'
import { omit } from 'lodash'
import { Children, forwardRef, useEffect, useRef, useState } from 'react'
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

const FramerSequence = (props: ParentProps<{ className?: string }, {}>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null!)

  const animControls = useRef<AnimationPlaybackControls>()
  const { scrollYProgress } = useScroll()

  scrollYProgress.on('change', y => {
    if (!animControls.current) return
    animControls.current.time = y * animControls.current.duration
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
            const sequence = props.children.map((x, i) => {
              const sequence: AnimationSequence[number] = [
                ctx.elements[x.props.name],
                x.props.animate,
                x.props.transition
              ]
              return sequence
            })

            animControls.current = animate(sequence)

            animControls.current.pause()
            animControls.current.time = scrollYProgress.get()
            if (props.setup) props.setup(self, ctx)
          }
        }}
        getSelf={options => ({})}>
        <div className={props.className}>{props.children}</div>
      </FrameComponent>
    </>
  )
}

export const FramerDiv = (
  props: ChildProps<
    {
      animate: DOMSegment['1']
      transition?: DOMSegmentWithTransition['2']
      label?: SequenceLabel | SequenceLabelWithTime
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

export const FramerObject = <T extends Record<string, any>>(
  props: ChildProps<
    {
      initial: T
      animate: T
      transition?:
        | DOMSegmentWithTransition['2']
        | MotionValueSegmentWithTransition['2']
      label?: SequenceLabel | SequenceLabelWithTime
      className?: string
    },
    T,
    {}
  >
) => {
  const initialObject = useRef<T>(props.initial)
  return (
    <ChildComponent
      options={props}
      getSelf={() => {
        return initialObject.current
      }}
    />
  )
}

export const FramerValue = <T extends string | number>(
  props: ChildProps<
    {
      initial: T
      animate: MotionValueSegmentWithTransition['1']
      transition?: MotionValueSegmentWithTransition['2']
      label?: SequenceLabel | SequenceLabelWithTime
      className?: string
    },
    MotionValue<T>,
    {}
  >
) => {
  const initialValue = useMotionValue<T>(props.initial)
  return (
    <ChildComponent
      options={props}
      getSelf={() => {
        return initialValue
      }}
    />
  )
}

export default FramerSequence
