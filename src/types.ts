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
  draw?: (self: Self, context: ReactiveContext) => void
  setup?: (self: Self, context: Omit<ReactiveContext, 'time'>) => void
  deps?: DepsOptions
} & React.PropsWithChildren

export type ChildProps<Props, Self, Parent> = Props & {
  name: string
  draw?: (self: Self, parent: Parent, context: ReactiveContext) => void
  setup?: (
    self: Self,
    parent: Parent,
    context: Omit<ReactiveContext, 'time'>
  ) => void
  deps?: DepsOptions
} & React.PropsWithChildren

export type ComponentType = {
  draw: ((context: ReactiveContext) => void) | null
  self: any
  update: 'always' | boolean
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
