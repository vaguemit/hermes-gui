import { test, expect, describe, beforeEach } from 'vitest'
import { useStore } from '../store'

beforeEach(() => {
  useStore.setState({
    gatewayStatus: 'unchecked',
    agentState: 'idle',
    activeModel: 'claude-3-5-sonnet',
    tokensUsed: 0,
    contextWindow: 200000,
    modelSwitcherOpen: false,
  })
})

describe('gateway store actions', () => {
  test('setGatewayStatus updates to connecting', () => {
    useStore.getState().setGatewayStatus('connecting')
    expect(useStore.getState().gatewayStatus).toBe('connecting')
  })

  test('setGatewayStatus updates to connected', () => {
    useStore.getState().setGatewayStatus('connected')
    expect(useStore.getState().gatewayStatus).toBe('connected')
  })

  test('setGatewayStatus updates to disconnected', () => {
    useStore.getState().setGatewayStatus('disconnected')
    expect(useStore.getState().gatewayStatus).toBe('disconnected')
  })

  test('setAgentState transitions to thinking', () => {
    useStore.getState().setAgentState('thinking')
    expect(useStore.getState().agentState).toBe('thinking')
  })

  test('setAgentState transitions to running_tool', () => {
    useStore.getState().setAgentState('running_tool')
    expect(useStore.getState().agentState).toBe('running_tool')
  })

  test('setAgentState transitions back to idle', () => {
    useStore.getState().setAgentState('thinking')
    useStore.getState().setAgentState('idle')
    expect(useStore.getState().agentState).toBe('idle')
  })

  test('setActiveModel updates the model string', () => {
    useStore.getState().setActiveModel('claude-3-opus')
    expect(useStore.getState().activeModel).toBe('claude-3-opus')
  })

  test('setTokenUsage sets both fields', () => {
    useStore.getState().setTokenUsage(50000, 128000)
    const { tokensUsed, contextWindow } = useStore.getState()
    expect(tokensUsed).toBe(50000)
    expect(contextWindow).toBe(128000)
  })

  test('setModelSwitcherOpen toggles true then false', () => {
    useStore.getState().setModelSwitcherOpen(true)
    expect(useStore.getState().modelSwitcherOpen).toBe(true)

    useStore.getState().setModelSwitcherOpen(false)
    expect(useStore.getState().modelSwitcherOpen).toBe(false)
  })
})
