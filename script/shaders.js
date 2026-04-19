import * as THREE from 'three';
import { Fn, If, abs, add, atan, clamp, div, dot, exp, float, floor, fract, instanceIndex, int, ivec2, length, max, mix, mul, select, storageTexture, textureLoad, textureStore, uvec2, vec2, vec3, vec4 } from 'three/tsl';

const applyReflectiveBoundary = Fn(([indexUV, screenSize, v, e = float(0.9)]) => {
  const vOut = v.toVar();

  If(indexUV.x.lessThanEqual(0).and(vOut.x.lessThan(0)), () => {
    vOut.assign(vec2(vOut.x.mul(e).mul(-1.0), vOut.y));
  });
  If(indexUV.x.greaterThanEqual(screenSize.x.sub(1)).and(vOut.x.greaterThan(0)), () => {
    vOut.assign(vec2(vOut.x.mul(e).mul(-1.0), vOut.y));
  });
  If(indexUV.y.lessThanEqual(0).and(vOut.y.lessThan(0)), () => {
    vOut.assign(vec2(vOut.x, vOut.y.mul(e).mul(-1.0)));
  });
  If(indexUV.y.greaterThanEqual(screenSize.y.sub(1)).and(vOut.y.greaterThan(0)), () => {
    vOut.assign(vec2(vOut.x, vOut.y.mul(e).mul(-1.0)));
  });
  return vOut;
});

const mirrorRepeatUV = Fn(([uv = vec2(), texelSize = vec2()]) => {
    const uvMin = texelSize.mul(0.5).toVar();
    const uvMax = vec2(1.0).sub(uvMin).toVar();
    const span = uvMax.sub(uvMin).toVar();

    const t = uv.sub(uvMin).div(span);
    const tri = float(1.0).sub(abs(float(1.0).sub(fract(t.mul(0.5)).mul(2.0))));

    return uvMin.add(tri.mul(span));
  },
);

const sampleBilinear4 = Fn(([srcTex, uv, screenSize]) => {
  const idxUV = uvec2(uv.mul(screenSize).floor());
  const idxUV00 = clamp(idxUV, uvec2(0), screenSize.sub(uvec2(2)));
  const idxUV10 = idxUV00.add(uvec2(1, 0));
  const idxUV01 = idxUV00.add(uvec2(0, 1));
  const idxUV11 = idxUV00.add(uvec2(1, 1));
  
  const c00 = textureLoad(srcTex, idxUV00);
  const c10 = textureLoad(srcTex, idxUV10);
  const c01 = textureLoad(srcTex, idxUV01);
  const c11 = textureLoad(srcTex, idxUV11);
  
  const f = clamp(uv.mul(screenSize).sub(vec2(idxUV00)), 0, 1);
  const cx0 = mix(c00, c10, f.x);
  const cx1 = mix(c01, c11, f.x);
  return mix(cx0, cx1, f.y);
});

const sampleNeighborVelocityReflect = Fn(([srcTex, indexUV, screenSize, dir, vCenter = vec2()]) => {
  const vNeighbor = textureLoad(srcTex, indexUV.add(dir)).xy.toVar();

  If(indexUV.x.lessThanEqual(0).and(dir.x.lessThan(0)), () => {
    vNeighbor.assign(vec2(vCenter.x.mul(-1), vCenter.y));
  });
  If(indexUV.x.greaterThanEqual(screenSize.x.sub(1)).and(dir.x.greaterThan(0)), () => {
    vNeighbor.assign(vec2(vCenter.x.mul(-1), vCenter.y));
  });
  If(indexUV.y.lessThanEqual(0).and(dir.y.lessThan(0)), () => {
    vNeighbor.assign(vec2(vCenter.x, vCenter.y.mul(-1)));
  });
  If(indexUV.y.greaterThanEqual(screenSize.y.sub(1)).and(dir.y.greaterThan(0)), () => {
    vNeighbor.assign(vec2(vCenter.x, vCenter.y.mul(-1)));
  });

  return vNeighbor;
});

const sampleNeighborPressureNeumann = Fn(([srcTex, indexUV, screenSize, dir, pCenter = float(0.0)]) => {
  const pNeighbor = textureLoad(srcTex, indexUV.add(dir)).z.toVar();

  If(indexUV.x.lessThanEqual(0).and(dir.x.lessThan(0)), () => {
    pNeighbor.assign(pCenter);
  });
  If(indexUV.x.greaterThanEqual(screenSize.x.sub(1)).and(dir.x.greaterThan(0)), () => {
    pNeighbor.assign(pCenter);
  });
  If(indexUV.y.lessThanEqual(0).and(dir.y.lessThan(0)), () => {
    pNeighbor.assign(pCenter);
  });
  If(indexUV.y.greaterThanEqual(screenSize.y.sub(1)).and(dir.y.greaterThan(0)), () => {
    pNeighbor.assign(pCenter);
  });

  return pNeighbor;
});

const hsv2rgb = Fn(([h = float(1.0), s = float(1.0), v = float(1.0)]) => {
    const k = vec3(0.0, 2.0, 1.0)
      .mul(1.0 / 3.0)
      .add(h);
    const c = clamp(abs(fract(k).mul(6.0).sub(3.0)).sub(1.0), 0.0, 1.0);
    return c.sub(1.0).mul(s).add(1.0).mul(v);
  },
);

export const addForce = Fn(([srcTex, dstTex, screenSize, forceCenter, deltaV, radius, isDragging]) => {
  const posX = instanceIndex.mod(screenSize.x);
  const posY = instanceIndex.div(screenSize.x);
  const indexUV = uvec2( posX, posY );
  const uv = vec2(posX, posY).div(screenSize);
  const data = textureLoad(srcTex, indexUV).toVar();
  
  const nd = uv.sub(forceCenter).div(max(vec2(radius).div(screenSize), vec2(1e-6)));
  
  const v = data.xy.toVar();
  
  If(isDragging, () => {
    v.addAssign(deltaV.mul(exp(dot(nd, nd).mul(-1.0))));
  });
  
  const vBounded = applyReflectiveBoundary(indexUV, screenSize, v, 1.0);
  const fragColor = vec4(vBounded, data.zw);
  
  textureStore(dstTex, indexUV, fragColor);
});

export const advectVelocity = Fn(([srcTex, dstTex, screenSize, deltaT, dsp]) => {
  const posX = instanceIndex.mod(screenSize.x);
  const posY = instanceIndex.div(screenSize.x);
  const indexUV = uvec2( posX, posY );
  const uv = vec2(posX, posY).div(screenSize);
  const data = textureLoad(srcTex, indexUV).toVar();
  const texelSize = vec2(screenSize).reciprocal();
  
  const backUV0 = uv.sub(data.xy.mul(deltaT).mul(texelSize));
  const backUV = mirrorRepeatUV(backUV0, texelSize);
  
  const advect0 = sampleBilinear4(srcTex, backUV, screenSize).xy;
  const advect1 = advect0.mul(dsp);
  const advect = applyReflectiveBoundary(indexUV, screenSize, advect1, 1.0);
  const fragColor = vec4(advect, data.zw);
  
  textureStore(dstTex, indexUV, fragColor);
});

export const updateDivergence = Fn(([srcTex, dstTex, screenSize]) => {
  const posX = instanceIndex.mod(screenSize.x);
  const posY = instanceIndex.div(screenSize.x);
  const indexUV = uvec2( posX, posY );
  const data = textureLoad(srcTex, indexUV).toVar();
  
  const left = sampleNeighborVelocityReflect(
    srcTex,
    indexUV,
    screenSize,
    ivec2(-1, 0),
    data.xy
  ).x;
  const right = sampleNeighborVelocityReflect(
    srcTex,
    indexUV,
    screenSize,
    ivec2(1, 0),
    data.xy
  ).x;
  const up = sampleNeighborVelocityReflect(
    srcTex,
    indexUV,
    screenSize,
    ivec2(0, -1),
    data.xy
  ).y;
  const down = sampleNeighborVelocityReflect(
    srcTex,
    indexUV,
    screenSize,
    ivec2(0, 1),
    data.xy
  ).y;

  const divergence = right.sub(left).add(down.sub(up)).mul(0.5);
  const fragColor = vec4(data.xyz, divergence);
  textureStore(dstTex, indexUV, fragColor);
});

export const updatePressure = Fn(([srcTex, dstTex, screenSize]) => {
  const posX = instanceIndex.mod(screenSize.x);
  const posY = instanceIndex.div(screenSize.x);
  const indexUV = uvec2( posX, posY );
  const data = textureLoad(srcTex, indexUV).toVar();

  const left = sampleNeighborPressureNeumann(
    srcTex,
    indexUV,
    screenSize,
    ivec2(-1, 0),
    data.z,
  );
  const right = sampleNeighborPressureNeumann(
    srcTex,
    indexUV,
    screenSize,
    ivec2(1, 0),
    data.z,
  );
  const up = sampleNeighborPressureNeumann(
    srcTex,
    indexUV,
    screenSize,
    ivec2(0, -1),
    data.z,
  );
  const down = sampleNeighborPressureNeumann(
    srcTex,
    indexUV,
    screenSize,
    ivec2(0, 1),
    data.z,
  );

  const p = left.add(right).add(up).add(down).sub(data.w).mul(0.25);
  const fragColor = vec4(data.xy, p, data.w);
  textureStore(dstTex, indexUV, fragColor);
});

export const subtractGradient = Fn(([srcTex, dstTex, screenSize]) => {
  const posX = instanceIndex.mod(screenSize.x);
  const posY = instanceIndex.div(screenSize.x);
  const indexUV = uvec2( posX, posY );
  const data = textureLoad(srcTex, indexUV).toVar();
  
  const left = sampleNeighborPressureNeumann(
    srcTex,
    indexUV,
    screenSize,
    ivec2(-1, 0),
    data.z,
  );
  const right = sampleNeighborPressureNeumann(
    srcTex,
    indexUV,
    screenSize,
    ivec2(1, 0),
    data.z,
  );
  const up = sampleNeighborPressureNeumann(
    srcTex,
    indexUV,
    screenSize,
    ivec2(0, -1),
    data.z,
  );
  const down = sampleNeighborPressureNeumann(
    srcTex,
    indexUV,
    screenSize,
    ivec2(0, 1),
    data.z,
  );

  const v0 = data.xy.sub(vec2(right.sub(left), down.sub(up)).mul(0.5));
  const v = applyReflectiveBoundary(indexUV, screenSize, v0, 1.0);

  const fragColor = vec4(v, data.zw);
  
  textureStore(dstTex, indexUV, fragColor);
});

export const renderShader = Fn(([srcTex, dstTex, screenSize, timeStep]) => {
  const posX = instanceIndex.mod(screenSize.x);
  const posY = instanceIndex.div(screenSize.x);
  const indexUV = uvec2( posX, posY );
  const uv = vec2(posX, posY).div(screenSize);
  const data = textureLoad(srcTex, indexUV).toVar();
  
  const hueBase = fract(atan(data.y, data.x).mul(1 / (Math.PI * 2.0)));
  const tri = hueBase.mul(2.0).sub(1.0).abs().mul(-1.0).add(1.0);
  const hue = tri.mul(1.0 / 6.0).add(timeStep.mul(0.0001));
  
  const speed = length(data.xy);
  const sat = clamp(speed.mul(30.0), 0.3, 0.9);
  const fragColor = vec4(hsv2rgb(hue, sat, 0.9), 1.0);
  
  textureStore(dstTex, indexUV, fragColor);
});
