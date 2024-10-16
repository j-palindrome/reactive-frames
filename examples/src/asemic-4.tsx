import { range } from 'lodash'
import Asemic from '../../asemic/asemic'
import { Vector2, Color } from 'three'
import { Brush } from '../../asemic/Brush'

export default function Asemic4() {
  return (
    <Asemic>
      <Brush
        keyframes={[
          // {
          //   curves: [
          //     [
          //       [1, 0],
          //       [-1, 0.25],
          //       [1, 0.5],
          //       [-1, 0.75],
          //       [1, 1]
          //     ].map(curve => ({
          //       position: new Vector2(...curve),
          //       alpha: 0.1 / 10
          //     }))
          //   ]
          // }
          // {
          //   curves: [
          //     range(10).map(curve => ({
          //       position: new Vector2().random(),
          //       alpha: 1 / 10
          //     })),
          //     range(3).map(curve => ({
          //       position: new Vector2().random(),
          //       alpha: 1 / 10
          //     }))
          //   ]
          // }
          {
            curves: range(100).map(() =>
              range(Math.ceil(Math.random() * 4) + 1).map(i => ({
                position: new Vector2().random(),
                // position: new Vector2().random(),
                thickness: Math.random() * 2 + 1,
                alpha: 0.05 / 2
              }))
            )
          },
          {
            curves: range(100).map(() =>
              range(Math.ceil(Math.random() * 4) + 1).map(i => ({
                position: new Vector2().random(),
                // position: new Vector2().random(),
                thickness: Math.random() * 2 + 1,
                alpha: 0.05 / 2
              }))
            )
          }
        ]}
        size={1}
      />
    </Asemic>
  )
}
