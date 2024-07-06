import { useRef } from 'react'
import { FrameComponent } from '../blocks/FrameChildComponents'
import { omit } from 'lodash'
import { CanvasComponentProps, ParentProps } from '../types'
import type HydraInstance from 'hydra-synth'

const Hydra = (
  props: ParentProps<Omit<CanvasComponentProps, 'type'>, HydraInstance['synth']>
) => {
  // const canvasRef = useRef<HTMLCanvasElement>(null!)
  const hydraRef = useRef<any>(null)

  return (
    <>
      {/* <CanvasComponent
        ref={canvasRef}
        {...extractCanvasProps(props)}
        onResize={self => {
          if (!hydraRef.current) return
          hydraRef.current.width = self.width
          hydraRef.current.height = self.height
          hydraRef.current.synth.width = self.width
          hydraRef.current.synth.height = self.height
          console.log('resized', hydraRef.current)
        }}
      /> */}
      <FrameComponent
        options={omit(props, 'children')}
        cleanupSelf={self => {
          hydraRef.current.synth.hush()
          hydraRef.current.canvas.remove()
        }}
        getSelf={async options => {
          const { default: HydraInstance } = await import('hydra-synth')
          const hydra = new HydraInstance({
            width: options.width,
            height: options.height,
            autoLoop: true,
            makeGlobal: false,
            detectAudio: false,
            ...options
          })
          hydraRef.current = hydra

          if (options.className) {
            // @ts-ignore
            const c = hydra.canvas as HTMLCanvasElement
            c.classList.add(...options.className.split(' '))
          }

          hydraRef.current = hydra
          return hydra.synth
        }}>
        {props.children}
      </FrameComponent>
    </>
  )
}

export default Hydra
