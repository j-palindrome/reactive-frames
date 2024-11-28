import { FrameComponent } from '../blocks/FrameChildComponents'
import { Canvas } from '@react-three/fiber'
import { Children, createContext, useEffect, useRef } from 'react'
import { ParentProps } from '../types'
import { omit } from 'lodash'
import Builder, { Built } from './drawingSystem/Builder'

export default function Asemic(
  props: ParentProps<
    {
      src: string | (() => Builder[])
      process?: (builders: Builder[]) => void
    },
    {}
  >
) {
  const points = useRef<[number, number][]>([])
  const builders =
    typeof props.src === 'string'
      ? props.src
          .split('\n')
          .filter(x => !x.startsWith('//') && x && x.length)
          .map((value, i) => new Built(new Builder(g => g.parse(value))))
      : props.src().map(builder => new Built(builder))

  if (props.process) props.process(builders)
  return (
    <>
      <FrameComponent
        options={{ ...omit(props, 'children') }}
        getSelf={() => {
          return {}
        }}>
        <Canvas
          style={{ height: '100%', width: '100%' }}
          gl={{ antialias: true }}
          orthographic
          camera={{
            position: [0, 0, 0],
            near: 0,
            far: 1,
            left: 0,
            top: 1,
            right: 1,
            bottom: 0
          }}
          onClick={ev => {
            if (ev.shiftKey) {
              points.current = []
            }
            const point = [
              ev.clientX / window.innerWidth,
              (window.innerHeight - ev.clientY) / window.innerHeight
            ] as [number, number]
            points.current.push(point)
            const text = points.current
              .map(x => `[${x[0].toFixed(2)}, ${x[1].toFixed(2)}]`)
              .join(', ')
            window.navigator.clipboard.writeText(text)
          }}>
          <color attach='background' args={['#000000']} />
          {builders.map((b, i) => b.render(`asemic_builder-${i}`, i))}
          {props.children}
        </Canvas>
      </FrameComponent>
    </>
  )
}
