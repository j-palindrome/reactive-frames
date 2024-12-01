import { cloneDeep, range } from 'lodash'
import { Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Builder from '../../src/asemic/drawingSystem/Builder'
import { PointBuilder } from '../../src/asemic/drawingSystem/PointBuilder'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  // a poem in space
  const strokes = `
wholesome > +0.1,0.5 *0.8 @[0 0.5] *[0.5 2 0.4] > +0,-0.5 *[0.5 2] @[-1 1] >0
`

  return (
    <Reactive
      progress={t => {
        return (t * 10) % 1
      }}>
      <Asemic
        name='a'
        src={() =>
          range(1).map(
            i =>
              new Builder(p =>
                p
                  .newText('yippee')
                  // .setWarpGroups([{ scale: 0.5 }], { groups: [0, -1] })
                  .debug()
              )
          )
        }
      />
    </Reactive>
  )
}
