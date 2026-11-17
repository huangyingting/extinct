import { forwardRef, useMemo } from 'react';
import { BlendFunction, Effect } from 'postprocessing';
import { Color, Uniform } from 'three';

const fragment = /* glsl */ `
uniform vec3 tint;
uniform float saturation;
uniform float contrast;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb * tint, vec3(0.0));
  // Contrast as a power curve about mid-grey (0.18), which suits linear HDR input.
  c = 0.18 * pow(c / 0.18 + 1e-6, vec3(1.0 + contrast));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  outputColor = vec4(max(mix(vec3(luma), c, 1.0 + saturation), vec3(0.0)), inputColor.a);
}`;

/** Scene-wide colour grade: a linear multiplier, contrast and saturation, applied before tone mapping. */
class GradeEffect extends Effect {
  constructor(tint: string, saturation: number, contrast: number) {
    super('GradeEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['tint', new Uniform(new Color(tint))],
        ['saturation', new Uniform(saturation)],
        ['contrast', new Uniform(contrast)],
      ]),
    });
  }
}

export const Grade = forwardRef<GradeEffect, { tint: string; saturation: number; contrast?: number }>(function Grade({ tint, saturation, contrast = 0 }, ref) {
  const effect = useMemo(() => new GradeEffect(tint, saturation, contrast), [tint, saturation, contrast]);
  return <primitive ref={ref} object={effect} dispose={null} />;
});
