export function validateMediaDuration(actualSeconds, requiredSeconds) {
  if (!Number.isFinite(actualSeconds) || actualSeconds <= 0) {
    throw new Error("Physical capture duration must be a finite positive number");
  }
  if (!Number.isFinite(requiredSeconds) || requiredSeconds <= 0) {
    throw new Error("Required capture duration must be a finite positive number");
  }
  if (actualSeconds < requiredSeconds) {
    throw new Error(
      `Physical capture duration ${actualSeconds.toFixed(3)}s is shorter than required ${requiredSeconds.toFixed(3)}s`,
    );
  }
  return actualSeconds;
}
