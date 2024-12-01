import { RefObject } from 'react'

export type ReactiveContext<
  Elements extends Record<string, any> = any,
  Props extends Record<string, any> = any
> = {
  time: number
  deltaTime: number
  elements: Elements
  props: Props
}
export type AllowedChildren = JSX.Element | (JSX.Element | JSX.Element[])[]
export type DepsOptions = any[] | number | (() => number)

export type ParentProps<Props, Self> = Props & {
  name: string
  draw?: (self: Self, progress: number, context: ReactiveContext) => void
  setup?: (self: Self, context: ReactiveContext) => void
  deps?: DepsOptions
  children?: React.ReactElement | React.ReactElement[]
  startEnd?: [number, number]
}

export type ChildProps<Props, Self, Parent> = Props & {
  name: string
  draw?: (
    self: Self,
    parent: Parent,
    progress: number,
    context: ReactiveContext
  ) => void
  setup?: (self: Self, parent: Parent, context: ReactiveContext) => void
  deps?: DepsOptions
  startEnd?: [number, number]
} & React.PropsWithChildren

export type ComponentType = {
  draw: ((progress: number, context: ReactiveContext) => void) | null
  self: any
  update: 'always' | boolean
  startEnd: [number, number]
  hide?: (context: ReactiveContext) => void
  show?: (context: ReactiveContext) => void
  hidden: boolean
}

export type CanvasComponentProps = {
  className?: string
  width?: number
  height?: number
  id?: string
  noResize?: true
  hidden?: boolean
  webgl?: boolean
  onResize?: (self: HTMLCanvasElement) => void
}
