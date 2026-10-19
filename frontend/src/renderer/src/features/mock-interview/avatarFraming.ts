/** Fit the nearest depth plane as well as both image dimensions. */
export function avatarDistance(size: { x: number; y: number; z: number }, aspect: number, fov: number) {
  if (![size.x, size.y, size.z, aspect, fov].every(Number.isFinite) || Math.min(size.x, size.y, size.z) < 0 || aspect <= 0 || fov <= 0 || fov >= 180 || Math.max(size.x, size.y, size.z) === 0) throw new Error('Avatar bounds or camera are invalid')
  return Math.max(size.y, size.x / aspect) / (2 * Math.tan(fov * Math.PI / 360)) * 1.12 + size.z / 2
}
