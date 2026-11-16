/** Small, named ARKit subset retargeted to Bear One's existing SVG. */
export const FACE_CHANNELS = [
  "JawOpen",
  "MouthClose",
  "MouthPucker",
  "MouthSmileLeft",
  "MouthSmileRight",
  "EyeBlinkLeft",
  "EyeBlinkRight",
] as const;
export type FacePose = {
  jaw: number;
  pucker: number;
  smile: number;
  blink: number;
};
export type FaceAnimation = {
  source: "nvidia-audio2face";
  duration: number;
  frames: { time: number; values: number[] }[];
};
export const REST_FACE: FacePose = { jaw: 0, pucker: 0, smile: 0, blink: 0 };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function validateFaceAnimation(
  value: unknown,
  duration: number,
): FaceAnimation {
  const animation = value as FaceAnimation;
  if (
    !animation ||
    animation.source !== "nvidia-audio2face" ||
    !Number.isFinite(animation.duration) ||
    animation.duration <= 0 ||
    animation.duration > 53 ||
    Math.abs(animation.duration - duration) > 0.05 ||
    !Array.isArray(animation.frames) ||
    !animation.frames.length ||
    animation.frames.length > 3200
  )
    throw new Error("Invalid face animation");
  let previous = -1;
  for (const frame of animation.frames) {
    if (
      !Number.isFinite(frame.time) ||
      frame.time < 0 ||
      frame.time <= previous ||
      frame.time > duration + 0.1 ||
      !Array.isArray(frame.values) ||
      frame.values.length !== FACE_CHANNELS.length ||
      frame.values.some((x) => !Number.isFinite(x) || x < 0 || x > 1)
    )
      throw new Error("Invalid face frame");
    previous = frame.time;
  }
  if (animation.frames[0].time > 0.15 || previous < duration - 0.5)
    throw new Error("Incomplete face animation");
  return animation;
}
export function sampleFace(animation: FaceAnimation, time: number): FacePose {
  if (!Number.isFinite(time) || time < 0 || time >= animation.duration)
    return REST_FACE;
  const frames = animation.frames;
  let low = 0,
    high = frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (frames[mid].time <= time) low = mid;
    else high = mid - 1;
  }
  const a = frames[low],
    b = frames[Math.min(low + 1, frames.length - 1)];
  const mix = b.time > a.time ? clamp((time - a.time) / (b.time - a.time)) : 0;
  const v = a.values.map((x, i) => x + (b.values[i] - x) * mix);
  return {
    jaw: clamp(v[0] * (1 - v[1])),
    pucker: clamp(v[2]),
    smile: clamp((v[3] + v[4]) / 2),
    blink: clamp((v[5] + v[6]) / 2),
  };
}
