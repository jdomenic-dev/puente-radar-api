/** Whether a camera's YouTube stream was last seen broadcasting. */
export enum CameraStatus {
  Live = 'live',
  Offline = 'offline',
  /** Never checked, or the last check could not tell. Clients keep showing the camera. */
  Unknown = 'unknown',
}
