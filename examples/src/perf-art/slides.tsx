import Builder from '../../../asemic/src/drawingSystem/Builder'

export const slides: { asemic: ((b: Builder) => any)[] }[] = [
  {
    asemic: [b => b.eval(b => b.newGroup().newCurve([0, 0], [1, 1]), 10)]
  }
]
