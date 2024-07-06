import { Glsl, TransformApplication } from '../glsl/Glsl'
import arrayUtils from '../lib/array-utils'
import { TransformDefinitionInput } from '../glsl/transformDefinitions'

export interface TypedArg {
  value: TransformDefinitionInput['default']
  type: TransformDefinitionInput['type']
  isUniform: boolean
  name: TransformDefinitionInput['name']
  vecLen: number
}

export function formatArguments(
  transformApplication: TransformApplication,
  startIndex: number
): TypedArg[] {
  const { transform, userArgs } = transformApplication
  const { inputs } = transform

  return inputs.map((input, index) => {
    const vecLen = input.vecLen ?? 0

    let value: any = input.default
    let isUniform = false

    if (input.type === 'float') {
      value = ensureDecimalDot(value)
    }

    // if user has input something for this argument
    if (userArgs.length > index) {
      const arg = userArgs[index]

      value = arg
      // do something if a composite or transformApplication

      if (typeof arg === 'function') {
        if (vecLen > 0) {
          // expected input is a vector, not a scalar
          value = (context: any, props: any) =>
            fillArrayWithDefaults(arg(props), vecLen)
        } else {
          value = (context: any, props: any) => {
            try {
              return arg(props)
            } catch (e) {
              return input.default
            }
          }
        }

        isUniform = true
      } else if (Array.isArray(arg)) {
        if (vecLen > 0) {
          // expected input is a vector, not a scalar
          isUniform = true
          value = fillArrayWithDefaults(value, vecLen)
        } else {
          // is Array
          value = (context: any, props: any) => arrayUtils.getValue(arg)(props)
          isUniform = true
        }
      }
    }

    if (value instanceof Glsl) {
      // GLSLSource

      isUniform = false
    } else if (input.type === 'float' && typeof value === 'number') {
      // Number

      value = ensureDecimalDot(value)
    } else if (input.type.startsWith('vec') && Array.isArray(value)) {
      // Vector literal (as array)

      isUniform = false
      value = `${input.type}(${value.map(ensureDecimalDot).join(', ')})`
    } else if (input.type === 'sampler2D') {
      const ref = value

      value = () => ref.getTexture()
      isUniform = true
    }

    // Add to uniform array if is a function that will pass in a different value on each render frame,
    // or a texture/ external source

    let { name } = input
    if (isUniform) {
      name += startIndex
    }

    return {
      value,
      type: input.type,
      isUniform,
      vecLen,
      name
    }
  })
}

export function ensureDecimalDot(val: any): string {
  val = val.toString()
  if (val.indexOf('.') < 0) {
    val += '.'
  }
  return val
}

export function fillArrayWithDefaults(arr: any[], len: number) {
  // fill the array with default values if it's too short
  while (arr.length < len) {
    if (arr.length === 3) {
      // push a 1 as the default for .a in vec4
      arr.push(1.0)
    } else {
      arr.push(0.0)
    }
  }
  return arr.slice(0, len)
}
