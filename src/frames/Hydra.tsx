import { useRef } from 'react'
import CanvasComponent, { extractCanvasProps } from '../blocks/CanvasComponent'
import { FrameComponent } from '../blocks/FrameChildComponents'
import { omit } from 'lodash'
import { CanvasComponentProps, ParentProps } from '../types'
import HydraInstance from 'hydra-synth'

const Hydra = (
  props: ParentProps<Omit<CanvasComponentProps, 'type'>, HydraInstance['synth']>
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  return (
    <>
      <CanvasComponent ref={canvasRef} {...extractCanvasProps(props)} webgl />
      <FrameComponent
        options={omit(props, 'children')}
        getSelf={options => {
          const hydra = new HydraInstance({
            canvas: canvasRef.current,
            width: options.width,
            height: options.height,
            autoLoop: false,
            makeGlobal: false
          })
          return hydra.synth
        }}>
        {props.children}
      </FrameComponent>
    </>
  )
}

export default Hydra
