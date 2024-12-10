import { useRef } from 'react'
import { FrameComponent } from '../blocks/FrameChildComponents'
import { omit } from 'lodash'
import { CanvasComponentProps, ParentProps } from '../types'
import CanvasComponent, { extractCanvasProps } from '../blocks/CanvasComponent'
import REGL, { Regl } from 'regl'
import {
  createGenerators,
  defaultGenerators,
  defaultModifiers,
  Hydra,
  generators
} from 'hydra-ts'

const HydraEx = (
  props: ParentProps<
    Omit<CanvasComponentProps, 'type'>,
    { hydra: Hydra; generators: typeof generators }
  >
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  const hydraRef = useRef<Hydra>(null!)

  return (
    <>
      <CanvasComponent
        ref={canvasRef}
        {...extractCanvasProps(props)}
        onResize={self => {
          if (!hydraRef.current) return
          hydraRef.current.setResolution(
            self.width * devicePixelRatio,
            self.height * devicePixelRatio
          )
        }}
      />
      <FrameComponent
        options={omit(props, 'children')}
        cleanupSelf={self => {
          hydraRef.current.hush()
        }}
        getSelf={async options => {
          const hydra = new Hydra({
            width: options.width ?? window.innerWidth,
            height: options.height ?? window.innerHeight,
            // @ts-ignore
            regl: REGL({
              canvas: canvasRef.current
            }),
            ...options
          })
          hydraRef.current = hydra

          if (options.className) {
            // @ts-ignore
            const c = hydra.canvas as HTMLCanvasElement
            c.classList.add(...options.className.split(' '))
          }

          // const generators = createGenerators({
          //   generatorTransforms: defaultGenerators,
          //   modifierTransforms: defaultModifiers
          // })
          hydraRef.current = hydra
          return { hydra, generators }
        }}
        defaultDraw={h => {
          h.hydra.tick(1 / 60)
        }}>
        {props.children}
      </FrameComponent>
    </>
  )
}

export default HydraEx
