import { forwardRef, useMemo } from 'react';
import { BlendFunction, Effect } from 'postprocessing';
import { Color, Uniform } from 'three';

const fragment = /* glsl */ `
uniform vec3 tint;
uniform float saturation;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * tint;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  outputColor = vec4(mix(vec3(luma), c, 1.0 + saturation), inputColor.a);
}`;

/** Scene-wide colour grade: a linear multiplier and a saturation change, applied before tone mapping. */
class GradeEffect extends Effect {
  constructor(tint: string, saturation: number) {
    super('GradeEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['tint', new Uniform(new Color(tint))],
        ['saturation', new Uniform(saturation)],
      ]),
    });
  }
}

export const Grade = forwardRef<GradeEffect, { tint: string; saturation: number }>(function Grade({ tint, saturation }, ref) {
  const effect = useMemo(() => new GradeEffect(tint, saturation), [tint, saturation]);
  return <primitive ref={ref} object={effect} dispose={null} />;
});
