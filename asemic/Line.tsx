import { useMemo } from 'react'
import { Brush, Point } from './Brush'
import invariant from 'tiny-invariant'
import { letters } from './data'
import { range } from 'lodash'
import { Vector2 } from 'three'

export default function StrokeText({ children }: React.PropsWithChildren) {
  invariant(typeof children === 'string')

  const curves = useMemo(() => {
    const curves: Point[][] = []
    console.log(children)

    for (let i of range(children.length)) {
      const letter = children[i]
      if (!letters[letter]) continue
      curves.push(
        ...letters[letter].map(x =>
          x.map(
            x =>
              ({
                position: new Vector2((x[0] + i) / children.length, x[1])
              } as Point)
          )
        )
      )
    }
    return curves
  }, [])
  console.log(curves)

  return <Brush keyframes={[{ curves }]} size={1} />
}
