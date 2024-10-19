import { FrameComponent } from '../blocks/FrameChildComponents'
import { Canvas } from '@react-three/fiber'
import { Children, createContext, useRef } from 'react'
import { ParentProps } from '../types'
import { omit } from 'lodash'

export default function Asemic(props: ParentProps<{}, {}>) {
  const points = useRef<[number, number][]>([])
  return (
    <>
      <FrameComponent
        options={{ ...omit(props, 'children') }}
        getSelf={() => {
          return {}
        }}>
        <Canvas
          className='fixed h-screen w-screen'
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
            console.log(point.map(x => x.toFixed(2)))

            window.navigator.clipboard.writeText(text)
          }}>
          <color attach='background' args={['#000000']} />
          {props.children}
        </Canvas>
      </FrameComponent>
    </>
  )
}
