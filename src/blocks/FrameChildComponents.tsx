'use client'

import { Children, createContext, useEffect, useRef, useState } from 'react'
import invariant from 'tiny-invariant'
import { useInvariantContext } from '../utilities/react'
import _, { omit } from 'lodash'
import {
  AllowedChildren,
  ChildProps,
  DepsOptions,
  ParentProps,
  ReactiveContext,
  ComponentType
} from '../types'

function useCreateComponent<Self>(
  name: string,
  getSelf: () => Self | Promise<Self>,
  options: Record<string, any>,
  setupSelf?: (self: Self, context: ReactiveContext) => void,
  drawSelf?: (self: Self, progress: number, context: ReactiveContext) => void,
  drawSelfDeps?: DepsOptions,
  cleanupSelf?: (self: Self) => void,
  hideSelf?: (self: Self, context: ReactiveContext) => void,
  showSelf?: (self: Self, context: ReactiveContext) => void,
  startEnd?: [number, number]
) {
  const { allCreated, registerComponent, elements, props } =
    useInvariantContext(
      TopLevelContext,
      'Need to nest under <Reactive> component'
    )

  const [self, setSelf] = useState<Self | null>(null)
  const creating = useRef(false)

  const asyncCreate = async () => {
    const self = await getSelf()
    setSelf(self)
    creating.current = false
  }

  const recreateDeps = Object.values(
    omit(options, 'name', 'setup', 'draw', 'children', 'deps')
  )
    .map(x => x.toString())
    .join(';')

  useEffect(() => {
    if (!self) return

    registerComponent(name, {
      self,
      draw: drawSelf
        ? (progress, context) => drawSelf(self, progress, context)
        : null,
      update: drawSelfDeps ? false : 'always',
      hidden: false,
      hide: hideSelf ? context => hideSelf(self, context) : undefined,
      show: showSelf ? context => showSelf(self, context) : undefined,
      startEnd
    })
    return () => {
      registerComponent(name, null)
      if (cleanupSelf) {
        cleanupSelf(self)
      }
    }
  }, [self])

  useEffect(() => {
    if (creating.current) return
    creating.current = true
    asyncCreate()
    return
  }, [recreateDeps])

  useEffect(
    () => {
      if (!self || !drawSelfDeps) return
      const requestFrame = () => registerComponent(name, { update: true })
      if (typeof drawSelfDeps === 'number') {
        const interval = window.setInterval(requestFrame, drawSelfDeps)
        return () => window.clearInterval(interval)
      } else if (typeof drawSelfDeps === 'function') {
        let timeout: number
        const repeatFrameRequest = () => {
          requestFrame()
          timeout = window.setTimeout(repeatFrameRequest, drawSelfDeps())
        }
        timeout = window.setTimeout(repeatFrameRequest, drawSelfDeps())
        return () => window.clearTimeout(timeout)
      } else {
        requestFrame()
      }
    },
    drawSelfDeps instanceof Array ? drawSelfDeps : [self]
  )

  useEffect(() => {
    if (!self) return
    registerComponent(name, {
      draw: drawSelf
        ? (progress, context) => drawSelf(self, progress, context)
        : null
    })
  }, [drawSelf])

  useEffect(() => {
    if (!self || !setupSelf || !allCreated) return
    setupSelf(self, { elements, props, time: 0, deltaTime: 0 })
    return () => {
      cleanupSelf && cleanupSelf(self)
    }
  }, [allCreated, options])
  return { self }
}

const TopLevelContext = createContext<{
  registerComponent: (
    name: string,
    component: Partial<ComponentType> | null
  ) => void
  elements: Record<string, any>
  props: Record<string, any>
  allCreated: boolean
} | null>(null)
const FrameContext = createContext<{
  frame: any
} | null>(null)

function TopLevelComponent({
  children,
  loop = true,
  className,
  style = { height: '100vh', width: '100vw' },
  showInfo,
  progress = time => time
}: {
  children?: AllowedChildren
  loop?: boolean | number
  className?: string
  style?: React.CSSProperties
  showInfo?: true
  progress?: (time: number) => number
}) {
  // the order to call draw calls in, using the key/string pairings from above
  let childrenDraws = useRef<string[]>([])
  // We have to save setups so that we know what hasn't been created yet. Every time a component calls registerComponent (on creation) this list is updated. Once the draw
  let allChildrenOrdered = useRef<string[]>([])

  useEffect(() => {
    let setupCalls: any[] = []
    const childMap = (child: JSX.Element | JSX.Element[] | undefined) => {
      if (!child || !child['props']) return
      if (child instanceof Array) {
        child.forEach(child => childMap(child))
        return
      }

      if (child.props.name) {
        setupCalls.push(child.props.name)
      }
      Children.forEach(child.props.children, child => childMap(child))
    }

    Children.forEach(children, child => childMap(child))
    allChildrenOrdered.current = setupCalls
  }, [children])

  const [allCreated, setAllCreated] = useState(false)

  const components = useRef<Record<string, ComponentType>>({})
  // when allCreated is true elements get passed down as is (just to pass selves through)
  const elements = useRef<Record<string, any>>({})
  const props = useRef<Record<string, any>>({})
  const registerComponent = (
    name: string,
    component: Partial<ComponentType> | null
  ) => {
    if (component) {
      components.current[name] = { ...components.current[name], ...component }
      if (component.self) elements.current[name] = component.self
    } else {
      delete components.current[name]
      delete elements.current[name]
    }

    let allCreated = true
    for (let key of allChildrenOrdered.current) {
      if (!components.current[key]) {
        allCreated = false
        break
      }
    }

    // assemble a new list of draw calls in the proper order of nesting
    let newChildrenDraws: string[] = []
    for (let [name, component] of Object.entries(components.current)) {
      if (component.draw) newChildrenDraws.push(name)
    }
    childrenDraws.current = _.sortBy(newChildrenDraws, name =>
      allChildrenOrdered.current.indexOf(name)
    )

    setAllCreated(allCreated)
  }

  const time = useRef(0)

  useEffect(() => {
    if (!allCreated) return

    let animationFrame: number
    let interval: number
    let lastProgress = 0
    const drawFrame = (t: number) => {
      const time = progress(t / 1000)
      const topContext: ReactiveContext = {
        time,
        deltaTime: time - lastProgress,
        elements: elements.current,
        props: props.current
      }
      lastProgress = time
      for (let drawChild of childrenDraws.current) {
        const component = components.current[drawChild]
        invariant(component.draw, 'Missing draw call')

        // some components only draw on certain updates
        if (!component.update) continue

        if (component.startEnd) {
          if (time < component.startEnd[0] || time > component.startEnd[1]) {
            if (!component.hidden && component.hide !== undefined) {
              component.hidden = true
              invariant(component.hide)
              component.hide(topContext)
            }
            return
          } else if (
            component.hidden &&
            time >= component.startEnd[0] &&
            time <= component.startEnd[1] &&
            component.show !== undefined
          ) {
            component.hidden = false
            invariant(component.show)
            component.show(topContext)
          }
        }

        const thisProgress = component.startEnd
          ? (time - component.startEnd[0]) /
            (component.startEnd[1] - component.startEnd[0])
          : time
        component.draw!(thisProgress, topContext)
        if (component.update === true) {
          // turn off draw until the next update is requested
          component.update = false
        }
      }
    }
    if (loop === true) {
      const frameRequest: FrameRequestCallback = t => {
        // this prevents dropped frames
        time.current = t
        drawFrame(time.current)
        animationFrame = requestAnimationFrame(frameRequest)
      }
      animationFrame = requestAnimationFrame(frameRequest)
    } else if (typeof loop === 'number') {
      interval = window.setInterval(() => {
        time.current += loop
        drawFrame(time.current)
      }, loop * 1000)
    }
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      if (interval) window.clearInterval(interval)
    }
  }, [allCreated, loop, components])

  const clickList = useRef<[number, number][]>([])
  useEffect(() => {
    if (!showInfo) return
    window.addEventListener('click', ev => {
      if (ev.altKey) {
        clickList.current = []
      } else if (ev.shiftKey) {
        clickList.current.splice(clickList.current.length - 1, 1)
      } else {
        clickList.current.push([
          ev.clientX / window.innerWidth,
          ev.clientY / window.innerHeight
        ])
      }
      window.navigator.clipboard.writeText(
        `[${clickList.current.map(x => `[${x[0]}, ${x[1]}]`).join(', ')}]`
      )
    })
  }, [showInfo])

  return (
    <TopLevelContext.Provider
      value={{
        allCreated,
        registerComponent,
        elements: elements.current,
        props: props.current
      }}>
      <div className={`${className}`} style={style}>
        {children}
      </div>
    </TopLevelContext.Provider>
  )
}

export const Reactive = TopLevelComponent

export type ChildComponentDefinition<Options, Self, Frame> = (
  props: ChildProps<Options, Self, Frame>
) => JSX.Element

export type FrameComponentDefinition<Self, Options> = (
  props: ParentProps<Self, Options>
) => JSX.Element

export function FrameComponent<Self, Options>({
  options,
  getSelf,
  cleanupSelf,
  children,
  defaultDraw,
  hide,
  show
}: { options: ParentProps<Options, Self> } & {
  getSelf: (options: Options) => Self | Promise<Self>
  cleanupSelf?: (self: Self) => void
  defaultDraw?: (
    self: Self,
    progress: number,
    context: ReactiveContext,
    options: Options
  ) => void
  hide?: (self: Self, context: ReactiveContext) => void
  show?: (self: Self, context: ReactiveContext) => void
} & React.PropsWithChildren) {
  const { self } = useCreateComponent(
    options.name,
    async () => await getSelf(options),
    options,
    options.setup,
    options.draw
      ? (self, progress, context) => {
          options.draw!(
            self,
            options.timeOptions?.modifyTime
              ? options.timeOptions.modifyTime(progress)
              : progress,
            context
          )
        }
      : defaultDraw
      ? (self, progress, context) => {
          defaultDraw(
            self,
            options.timeOptions?.modifyTime
              ? options.timeOptions.modifyTime(progress)
              : progress,
            context,
            options
          )
        }
      : options.draw
      ? options.draw
      : undefined,
    options.deps,
    cleanupSelf,
    hide,
    show
  )

  return (
    <FrameContext.Provider
      value={{
        frame: self
      }}>
      {self && children}
    </FrameContext.Provider>
  )
}

export function ChildComponent<Self, Options, Frame>({
  options,
  getSelf,
  cleanupSelf,
  children,
  defaultDraw,
  hide,
  show
}: {
  options: ChildProps<Options, Self, Frame>
} & {
  getSelf: (options: Options, frame: Frame) => Self | Promise<Self>
  cleanupSelf?: (self: Self) => void
  defaultDraw?: (
    self: Self,
    frame: Frame,
    progress: number,
    context: ReactiveContext,
    options: Options
  ) => void
  hide?: (self: Self, context: ReactiveContext) => void
  show?: (self: Self, context: ReactiveContext) => void
} & React.PropsWithChildren) {
  const { frame } = useInvariantContext(FrameContext)
  useCreateComponent(
    options.name,
    async () => await getSelf(options, frame),
    options,
    options.setup
      ? (self, context) => options.setup!(self, frame, context)
      : undefined,
    options.draw
      ? (self, progress, context) => {
          options.draw!(
            self,
            frame,
            options.timeOptions?.modifyTime
              ? options.timeOptions.modifyTime(progress)
              : progress,
            context
          )
        }
      : defaultDraw
      ? (self, progress, context) => {
          defaultDraw(
            self,
            frame,
            options.timeOptions?.modifyTime
              ? options.timeOptions.modifyTime(progress)
              : progress,
            context,
            options
          )
        }
      : undefined,
    options.deps,
    cleanupSelf,
    hide,
    show
  )
  return <>{children}</>
}

export const defineChildComponent = <Self, Options, Frame>(
  getSelf: (options: Options, frame: Frame) => Self | Promise<Self>,
  defaultDraw?: (
    self: Self,
    frame: Frame,
    progress: number,
    context: ReactiveContext,
    options: Options
  ) => void,
  cleanupSelf?: (self: Self) => void,
  hide?: (self: Self, context: ReactiveContext) => void,
  show?: (self: Self, context: ReactiveContext) => void
) => {
  return (options: ChildProps<Options, Self, Frame>) => (
    <ChildComponent
      options={options}
      getSelf={getSelf}
      cleanupSelf={cleanupSelf}
      defaultDraw={defaultDraw}
      hide={hide}
      show={show}>
      {options.children}
    </ChildComponent>
  )
}

export const defineFrameComponent = <Self, Options>(
  getSelf: (options: Options) => Self,
  defaultDraw?: (
    self: Self,
    progress: number,
    context: ReactiveContext,
    options: Options
  ) => void,
  cleanupSelf?: (self: Self) => void,
  hide?: (self: Self, context: ReactiveContext) => void,
  show?: (self: Self, context: ReactiveContext) => void
) => {
  return (options: ParentProps<Options, Self>) => (
    <FrameComponent
      options={options}
      getSelf={getSelf}
      cleanupSelf={cleanupSelf}
      defaultDraw={defaultDraw}
      hide={hide}
      show={show}>
      {options.children}
    </FrameComponent>
  )
}
