import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useEventListener } from '../utilities/react'
import pick from 'lodash/pick'
import { CanvasComponentProps } from '../types'

export const extractCanvasProps = (
  props: CanvasComponentProps & Record<string, any>
): CanvasComponentProps => {
  return {
    ...pick(
      props,
      'className',
      'width',
      'height',
      'id',
      'noResize',
      'hidden',
      'webgl',
      'onResize'
    )
  }
}

const CanvasComponent = forwardRef<HTMLCanvasElement, CanvasComponentProps>(
  (props, ref) => {
    const innerRef = useRef<HTMLCanvasElement>(
      props.hidden ? document.createElement('canvas') : null!
    )
    if (props.hidden) {
      innerRef.current.height = props.height ?? 1080
      innerRef.current.width = props.width ?? 1080
    }
    useImperativeHandle(ref, () => innerRef.current)
    const resizeCanvas = () => {
      const { width, height } = innerRef.current.getBoundingClientRect()
      innerRef.current.width = width * devicePixelRatio
      innerRef.current.height = height * devicePixelRatio
      if (props.webgl) {
        innerRef.current
          .getContext('webgl2')!
          .viewport(0, 0, innerRef.current.width, innerRef.current.height)
      }
      if (props.onResize) {
        props.onResize(innerRef.current)
      }
    }
    useEventListener('resize', () => {
      console.log('window is resized')

      if (props.noResize || props.hidden) return
      resizeCanvas()
    })
    useEffect(() => {
      if (props.noResize || props.hidden) return
      resizeCanvas()
    }, [])

    return (
      <>
        {!props.hidden && (
          <canvas
            ref={innerRef}
            className={props.className ?? 'h-full w-full'}
            id={props.id}
            height={props.height}
            width={props.width}></canvas>
        )}
      </>
    )
  }
)

export default CanvasComponent
