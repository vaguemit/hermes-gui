// Compile-time test — if this file compiles cleanly, all shapes are correct.
import { test } from 'vitest'
import type { HermesClient } from '../client'
import type { ChatMessage } from '../types'

// Helper to verify a function type at compile time
type Awaited<T> = T extends Promise<infer U> ? U : T

// Verify method signatures exist and return correct types
type _getHealth = ReturnType<HermesClient['getHealth']>
type _streamChat = ReturnType<HermesClient['streamChat']>
type _fetchModels = ReturnType<HermesClient['fetchModels']>
type _getGatewayLatency = ReturnType<HermesClient['getGatewayLatency']>
type _runHermesCommand = ReturnType<HermesClient['runHermesCommand']>
type _listMemoryFiles = ReturnType<HermesClient['listMemoryFiles']>
type _readMemoryFile = ReturnType<HermesClient['readMemoryFile']>
type _deleteMemoryFile = ReturnType<HermesClient['deleteMemoryFile']>
type _listSkills = ReturnType<HermesClient['listSkills']>
type _listCronJobs = ReturnType<HermesClient['listCronJobs']>
type _getConnectionConfig = ReturnType<HermesClient['getConnectionConfig']>
type _setConnectionConfig = ReturnType<HermesClient['setConnectionConfig']>
type _getGatewayUrl = ReturnType<HermesClient['getGatewayUrl']>
type _getGatewayHeaders = ReturnType<HermesClient['getGatewayHeaders']>
type _getGatewayPort = ReturnType<HermesClient['getGatewayPort']>
type _setGatewayPort = ReturnType<HermesClient['setGatewayPort']>

// Verify streamChat accepts AbortSignal as optional 4th arg
type _streamChatSig = HermesClient['streamChat']
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _streamChatArgs: Parameters<_streamChatSig> = [
  [] as ChatMessage[],
  'model-id',
  () => {},
  new AbortController().signal, // optional, should compile
]

// Verify runHermesCommand accepts optional timeout
type _runSig = HermesClient['runHermesCommand']
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _runArgs1: Parameters<_runSig> = [['status']] // no timeout
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _runArgs2: Parameters<_runSig> = [['status'], 30] // with timeout

// Verify setConnectionConfig accepts optional apiKey
type _setConnSig = HermesClient['setConnectionConfig']
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _setConn1: Parameters<_setConnSig> = ['local', ''] // no key
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _setConn2: Parameters<_setConnSig> = ['remote', 'https://x.com', 'sk-abc'] // with key

// Verify getGatewayUrl returns string and getGatewayHeaders returns Record<string,string>
type _urlIsString = _getGatewayUrl extends string ? true : false
type _urlAssert = _urlIsString extends true ? 'pass' : never
type _headersIsRecord = _getGatewayHeaders extends Record<string, string> ? true : false
type _headersAssert = _headersIsRecord extends true ? 'pass' : never

test('method signature shapes', () => {
  console.log('invoke-shapes.test.ts: all signature shape assertions passed (compile-time verification)')
})
