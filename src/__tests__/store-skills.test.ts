import { test, expect, describe, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { Skill } from '../store'

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return { id: 'skill-1', name: 'Test Skill', description: 'A test', content: '# Test', source: 'user', ...overrides }
}

beforeEach(() => {
  useStore.setState({ skills: [makeSkill()] })
})

describe('skills store actions', () => {
  test('addSkill appends to the list', () => {
    const newSkill = makeSkill({ id: 'skill-2', name: 'Second Skill' })
    useStore.getState().addSkill(newSkill)
    const { skills } = useStore.getState()
    expect(skills).toHaveLength(2)
    expect(skills[1].id).toBe('skill-2')
  })

  test('addSkill preserves existing skills', () => {
    const newSkill = makeSkill({ id: 'skill-3', name: 'Third Skill' })
    useStore.getState().addSkill(newSkill)
    const { skills } = useStore.getState()
    expect(skills[0].id).toBe('skill-1')
    expect(skills[0].name).toBe('Test Skill')
  })

  test('updateSkill patches only the target skill', () => {
    useStore.getState().addSkill(makeSkill({ id: 'skill-2', name: 'Second Skill' }))
    useStore.getState().updateSkill('skill-1', { name: 'Updated Name', description: 'Updated desc' })
    const { skills } = useStore.getState()
    const updated = skills.find((s) => s.id === 'skill-1')!
    expect(updated.name).toBe('Updated Name')
    expect(updated.description).toBe('Updated desc')
    expect(updated.content).toBe('# Test')
  })

  test('updateSkill does not modify other skills', () => {
    useStore.getState().addSkill(makeSkill({ id: 'skill-2', name: 'Second Skill' }))
    useStore.getState().updateSkill('skill-1', { name: 'Changed' })
    const { skills } = useStore.getState()
    const other = skills.find((s) => s.id === 'skill-2')!
    expect(other.name).toBe('Second Skill')
  })

  test('deleteSkill removes by id', () => {
    useStore.getState().addSkill(makeSkill({ id: 'skill-2', name: 'Second Skill' }))
    useStore.getState().deleteSkill('skill-1')
    const { skills } = useStore.getState()
    expect(skills).toHaveLength(1)
    expect(skills.find((s) => s.id === 'skill-1')).toBeUndefined()
    expect(skills[0].id).toBe('skill-2')
  })

  test('deleteSkill on non-existent id does not change length', () => {
    useStore.getState().deleteSkill('skill-999')
    const { skills } = useStore.getState()
    expect(skills).toHaveLength(1)
  })
})
