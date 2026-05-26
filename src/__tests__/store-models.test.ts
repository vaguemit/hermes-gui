import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'

beforeEach(() => {
  useStore.setState({
    activeModel: 'hermes-agent',
    tokensUsed: 0,
    contextWindow: 200000,
    agentState: 'idle',
    gatewayStatus: 'unchecked',
    modelSwitcherOpen: false,
  })
})

describe('activeModel', () => {
  it('has default value hermes-agent', () => {
    expect(useStore.getState().activeModel).toBe('hermes-agent')
  })

  it('setActiveModel updates to a new model string', () => {
    useStore.getState().setActiveModel('claude-3-5-sonnet')
    expect(useStore.getState().activeModel).toBe('claude-3-5-sonnet')
  })

  it('setActiveModel accepts an empty string', () => {
    useStore.getState().setActiveModel('')
    expect(useStore.getState().activeModel).toBe('')
  })

  it('setActiveModel accepts a long model name', () => {
    const longName = 'anthropic/claude-3-5-sonnet-20241022-long-variant-preview'
    useStore.getState().setActiveModel(longName)
    expect(useStore.getState().activeModel).toBe(longName)
  })

  it('setActiveModel accepts model strings with slashes (provider/model format)', () => {
    useStore.getState().setActiveModel('openai/gpt-4o')
    expect(useStore.getState().activeModel).toBe('openai/gpt-4o')
  })
})

describe('tokensUsed', () => {
  it('has default value of 0', () => {
    expect(useStore.getState().tokensUsed).toBe(0)
  })

  it('setTokenUsage updates tokensUsed', () => {
    useStore.getState().setTokenUsage(45000, 200000)
    expect(useStore.getState().tokensUsed).toBe(45000)
  })

  it('setTokenUsage to max context window value', () => {
    useStore.getState().setTokenUsage(200000, 200000)
    expect(useStore.getState().tokensUsed).toBe(200000)
  })

  it('setTokenUsage starting from non-zero resets to new value', () => {
    useStore.getState().setTokenUsage(10000, 200000)
    useStore.getState().setTokenUsage(75000, 200000)
    expect(useStore.getState().tokensUsed).toBe(75000)
  })
})

describe('contextWindow', () => {
  it('has default value of 200000', () => {
    expect(useStore.getState().contextWindow).toBe(200000)
  })

  it('setTokenUsage updates contextWindow', () => {
    useStore.getState().setTokenUsage(0, 128000)
    expect(useStore.getState().contextWindow).toBe(128000)
  })

  it('setTokenUsage sets both tokensUsed and contextWindow together', () => {
    useStore.getState().setTokenUsage(32000, 128000)
    const { tokensUsed, contextWindow } = useStore.getState()
    expect(tokensUsed).toBe(32000)
    expect(contextWindow).toBe(128000)
  })
})

describe('token usage percentage', () => {
  it('calculates 0% at default state', () => {
    const { tokensUsed, contextWindow } = useStore.getState()
    expect(tokensUsed / contextWindow).toBe(0)
  })

  it('calculates 50% when tokensUsed is half of contextWindow', () => {
    useStore.getState().setTokenUsage(100000, 200000)
    const { tokensUsed, contextWindow } = useStore.getState()
    expect(tokensUsed / contextWindow).toBe(0.5)
  })

  it('calculates 100% when tokensUsed equals contextWindow', () => {
    useStore.getState().setTokenUsage(128000, 128000)
    const { tokensUsed, contextWindow } = useStore.getState()
    expect(tokensUsed / contextWindow).toBe(1)
  })
})

describe('agentState transitions', () => {
  it('starts idle by default', () => {
    expect(useStore.getState().agentState).toBe('idle')
  })

  it('transitions idle -> thinking', () => {
    useStore.getState().setAgentState('thinking')
    expect(useStore.getState().agentState).toBe('thinking')
  })

  it('transitions thinking -> running_tool', () => {
    useStore.getState().setAgentState('thinking')
    useStore.getState().setAgentState('running_tool')
    expect(useStore.getState().agentState).toBe('running_tool')
  })

  it('transitions running_tool -> idle', () => {
    useStore.getState().setAgentState('running_tool')
    useStore.getState().setAgentState('idle')
    expect(useStore.getState().agentState).toBe('idle')
  })

  it('transitions to error state', () => {
    useStore.getState().setAgentState('error')
    expect(useStore.getState().agentState).toBe('error')
  })
})

describe('gatewayStatus transitions', () => {
  it('starts unchecked by default', () => {
    expect(useStore.getState().gatewayStatus).toBe('unchecked')
  })

  it('transitions unchecked -> connecting', () => {
    useStore.getState().setGatewayStatus('connecting')
    expect(useStore.getState().gatewayStatus).toBe('connecting')
  })

  it('transitions connecting -> connected', () => {
    useStore.getState().setGatewayStatus('connecting')
    useStore.getState().setGatewayStatus('connected')
    expect(useStore.getState().gatewayStatus).toBe('connected')
  })

  it('transitions connected -> disconnected', () => {
    useStore.getState().setGatewayStatus('connected')
    useStore.getState().setGatewayStatus('disconnected')
    expect(useStore.getState().gatewayStatus).toBe('disconnected')
  })

  it('transitions to error', () => {
    useStore.getState().setGatewayStatus('error')
    expect(useStore.getState().gatewayStatus).toBe('error')
  })
})

describe('modelSwitcherOpen', () => {
  it('is false by default', () => {
    expect(useStore.getState().modelSwitcherOpen).toBe(false)
  })

  it('setModelSwitcherOpen(true) opens the switcher', () => {
    useStore.getState().setModelSwitcherOpen(true)
    expect(useStore.getState().modelSwitcherOpen).toBe(true)
  })

  it('setModelSwitcherOpen(false) closes the switcher', () => {
    useStore.getState().setModelSwitcherOpen(true)
    useStore.getState().setModelSwitcherOpen(false)
    expect(useStore.getState().modelSwitcherOpen).toBe(false)
  })
})

describe('combined: model switch while gateway is connected', () => {
  it('model can be changed independently of gateway status', () => {
    useStore.getState().setGatewayStatus('connected')
    useStore.getState().setActiveModel('claude-3-opus')
    expect(useStore.getState().gatewayStatus).toBe('connected')
    expect(useStore.getState().activeModel).toBe('claude-3-opus')
  })

  it('gateway status change does not reset activeModel', () => {
    useStore.getState().setActiveModel('openai/gpt-4o')
    useStore.getState().setGatewayStatus('disconnected')
    expect(useStore.getState().activeModel).toBe('openai/gpt-4o')
  })

  it('token usage accumulates independently of model selection', () => {
    useStore.getState().setActiveModel('claude-3-5-sonnet')
    useStore.getState().setTokenUsage(50000, 200000)
    useStore.getState().setActiveModel('claude-3-opus')
    // Model switch does not clear token counts
    expect(useStore.getState().tokensUsed).toBe(50000)
    expect(useStore.getState().activeModel).toBe('claude-3-opus')
  })
})
