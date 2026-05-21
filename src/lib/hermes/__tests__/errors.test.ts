// Type-level and logic tests for UnsupportedCapabilityError.
// Run via: npx tsx src/lib/hermes/__tests__/errors.test.ts
import { UnsupportedCapabilityError } from '../errors'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`  PASS: ${msg}`)
}

function run() {
  console.log('errors.test.ts')

  const err = new UnsupportedCapabilityError('readFile', 'remote')
  assert(err instanceof UnsupportedCapabilityError, 'instanceof UnsupportedCapabilityError')
  assert(err instanceof Error, 'instanceof Error (extends Error)')
  assert(err.capability === 'readFile', 'capability field set')
  assert(err.mode === 'remote', 'mode field set')
  assert(err.message.includes('readFile'), 'message mentions capability')
  assert(err.message.includes('remote'), 'message mentions mode')
  assert(err.name === 'UnsupportedCapabilityError', 'name is set correctly')

  // Type guard test
  try {
    throw new UnsupportedCapabilityError('startGateway', 'remote')
  } catch (e) {
    assert(e instanceof UnsupportedCapabilityError, 'caught as UnsupportedCapabilityError')
    assert((e as UnsupportedCapabilityError).capability === 'startGateway', 'caught capability correct')
  }

  console.log('  All errors tests passed.')
}

run()
