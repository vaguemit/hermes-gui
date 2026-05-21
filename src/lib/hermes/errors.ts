export class UnsupportedCapabilityError extends Error {
  readonly capability: string
  readonly mode: string

  constructor(capability: string, mode: string) {
    super(`'${capability}' is not supported in ${mode} mode`)
    this.name = 'UnsupportedCapabilityError'
    this.capability = capability
    this.mode = mode
  }
}
