import { TransformApplication } from '../glsl/Glsl'
import ImmutableList from '../glsl/ImmutableList'
import { utilityFunctions } from '../glsl/utilityFunctions'
import { TypedArg } from './formatArguments'
import { generateGlslGenerator } from './generateGlsl'

export interface ShaderParams {
  uniforms: TypedArg[]
  transformApplications: TransformApplication[]
  fragColor: string
}

export function compileWithEnvironment(
  transformApplications: ImmutableList<TransformApplication>
): string {
  const shaderParams = compileGlsl(transformApplications)

  const frag = /* glsl */ `
  #version 300 es
  precision highp float;
  ${Object.values(shaderParams.uniforms)
    .map(uniform => {
      return `
      uniform ${uniform.type} ${uniform.name};`
    })
    .join('')}
  uniform float time;
  uniform vec2 resolution;
  in vec2 uv;
  out vec4 fragColor;

  ${Object.values(utilityFunctions)
    .map(transform => {
      return `
            ${transform.glsl}
          `
    })
    .join('')}

  ${shaderParams.transformApplications
    .map(transformApplication => {
      return `
            ${transformApplication.transform.glsl}
          `
    })
    .join('')}

  void main () {
    vec4 c = vec4(1, 0, 0, 1);
    vec2 st = gl_FragCoord.xy / resolution.xy;
    fragColor = ${shaderParams.fragColor};
  }
  `

  return frag.replaceAll('texture2D', 'texture')
}

function compileGlsl(
  transformApplications: ImmutableList<TransformApplication>
): ShaderParams {
  const shaderParams: ShaderParams = {
    uniforms: [],
    transformApplications: [],
    fragColor: ''
  }

  // Note: generateGlsl() also mutates shaderParams.transformApplications
  shaderParams.fragColor = generateGlslGenerator(
    transformApplications,
    shaderParams
  )('st')

  // remove uniforms with duplicate names
  const uniforms: Record<string, TypedArg> = {}
  shaderParams.uniforms.forEach(uniform => (uniforms[uniform.name] = uniform))
  shaderParams.uniforms = Object.values(uniforms)

  return shaderParams
}
