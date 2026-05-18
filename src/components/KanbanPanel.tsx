import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { readFile, writeFile, isTauriApp } from '../api/desktop';

interface KanbanTask {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
}

type ColumnId = KanbanTask['status'];

interface Column {
  id: ColumnId;
  label: string;
}

const COLUMNS: Column[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];

// Move target for left arrow: where does this column go when moving left?
const MOVE_LEFT: Partial<Record<ColumnId, ColumnId>> = {
  in_progress: 'todo',
  blocked: 'in_progress',
  done: 'blocked',
};

// Move target for right arrow
const MOVE_RIGHT: Partial<Record<ColumnId, ColumnId>> = {
  todo: 'in_progress',
  in_progress: 'done',
  blocked: 'in_progress',
  done: undefined,
};

const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const PERSIST_KEY = 'gui-kanban.json';

interface AddFormState {
  columnId: ColumnId;
  title: string;
  priority: KanbanTask['priority'];
}

export default function KanbanPanel() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState | null>(null);
  // Map of taskId -> 'confirm' for delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<Record<string, boolean>>({});
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Load from disk on mount
  useEffect(() => {
    if (!isTauriApp()) {
      setLoaded(true);
      return;
    }
    readFile(PERSIST_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setTasks(parsed);
          } catch {
            // ignore parse error, start fresh
          }
        }
      })
      .catch(() => {
        // file doesn't exist yet — start fresh
      })
      .finally(() => setLoaded(true));
  }, []);

  // Debounced persist on tasks change (skip first render before load)
  useEffect(() => {
    if (!loaded) return;
    if (!isTauriApp()) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      writeFile(PERSIST_KEY, JSON.stringify(tasks)).catch(() => {});
    }, 800);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [tasks, loaded]);

  // Focus add input when form opens
  useEffect(() => {
    if (addForm) {
      setTimeout(() => addInputRef.current?.focus(), 30);
    }
  }, [addForm?.columnId]);

  const handleAddTask = (columnId: ColumnId) => {
    if (addForm?.columnId === columnId) {
      setAddForm(null);
    } else {
      setAddForm({ columnId, title: '', priority: 'medium' });
    }
  };

  const commitAdd = () => {
    if (!addForm || !addForm.title.trim()) {
      setAddForm(null);
      return;
    }
    const task: KanbanTask = {
      id: generateId(),
      title: addForm.title.trim(),
      description: '',
      status: addForm.columnId,
      priority: addForm.priority,
      createdAt: Date.now(),
    };
    setTasks((prev) => [task, ...prev]);
    setAddForm(null);
  };

  const moveTask = (taskId: string, direction: 'left' | 'right') => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const next = direction === 'left' ? MOVE_LEFT[t.status] : MOVE_RIGHT[t.status];
        if (!next) return t;
        return { ...t, status: next };
      })
    );
  };

  const deleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setDeleteConfirm((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const handleTrashClick = (taskId: string) => {
    if (deleteConfirm[taskId]) {
      deleteTask(taskId);
    } else {
      setDeleteConfirm((prev) => ({ ...prev, [taskId]: true }));
      // Auto-reset confirm after 3s if user doesn't click again
      setTimeout(() => {
        setDeleteConfirm((prev) => {
          if (!prev[taskId]) return prev;
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      }, 3000);
    }
  };

  const priorityBadgeClass = (priority: KanbanTask['priority']) => {
    if (priority === 'high') return 'badge badge-error';
    if (priority === 'medium') return 'badge badge-connected';
    return 'badge badge-muted';
  };

  const priorityLabel = (priority: KanbanTask['priority']) => {
    if (priority === 'high') return 'High';
    if (priority === 'medium') return 'Med';
    return 'Low';
  };

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg0)', padding: 16, gap: 12 }}>
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        const isAdding = addForm?.columnId === col.id;

        return (
          <div
            key={col.id}
            style={{
              width: 260,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg1)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* Column header */}
            <div style={{
              padding: '12px 14px 10px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
                {col.label}
              </span>
              <span className="badge badge-idle" style={{ fontSize: 10.5, minWidth: 20, textAlign: 'center' }}>
                {colTasks.length}
              </span>
            </div>

            {/* Add button */}
            <div style={{ padding: '8px 10px 6px', flexShrink: 0 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleAddTask(col.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
              >
                <Plus size={13} />
                {isAdding ? 'Cancel' : 'Add Task'}
              </button>
            </div>

            {/* Inline add form */}
            {isAdding && (
              <div
                className="animate-in"
                style={{
                  margin: '0 10px 8px',
                  padding: 10,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border-active)',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <input
                  ref={addInputRef}
                  className="input-field"
                  placeholder="Task title…"
                  value={addForm.title}
                  onChange={(e) => setAddForm((f) => f ? { ...f, title: e.target.value } : f)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitAdd();
                    if (e.key === 'Escape') setAddForm(null);
                  }}
                  style={{ fontSize: 12.5, padding: '6px 9px' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    value={addForm.priority}
                    onChange={(e) => setAddForm((f) => f ? { ...f, priority: e.target.value as KanbanTask['priority'] } : f)}
                    style={{
                      flex: 1,
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      padding: '4px 7px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={commitAdd} style={{ fontSize: 12 }}>
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Task list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {colTasks.length === 0 && (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
                  No tasks
                </div>
              )}
              {colTasks.map((task) => {
                const isDone = task.status === 'done';
                const confirmingDelete = !!deleteConfirm[task.id];
                const canMoveLeft = !!MOVE_LEFT[task.status];
                const canMoveRight = !!MOVE_RIGHT[task.status];

                return (
                  <div
                    key={task.id}
                    className="animate-in"
                    style={{
                      background: 'var(--bg2)',
                      border: `1px solid var(--border)`,
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {/* Title */}
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDone ? 'var(--text-secondary)' : 'var(--text-primary)',
                      textDecoration: isDone ? 'line-through' : 'none',
                      opacity: isDone ? 0.6 : 1,
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}>
                      {task.title}
                    </span>

                    {/* Priority badge */}
                    <span className={priorityBadgeClass(task.priority)} style={{ alignSelf: 'flex-start', fontSize: 10.5 }}>
                      {priorityLabel(task.priority)}
                    </span>

                    {/* Action row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => moveTask(task.id, 'left')}
                        disabled={!canMoveLeft}
                        title="Move left"
                        style={{ opacity: canMoveLeft ? 1 : 0.25, padding: 4 }}
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => moveTask(task.id, 'right')}
                        disabled={!canMoveRight}
                        title="Move right"
                        style={{ opacity: canMoveRight ? 1 : 0.25, padding: 4 }}
                      >
                        <ChevronRight size={13} />
                      </button>
                      <div style={{ flex: 1 }} />
                      <button
                        className={confirmingDelete ? 'btn btn-danger btn-icon btn-sm' : 'btn btn-ghost btn-icon btn-sm'}
                        onClick={() => handleTrashClick(task.id)}
                        title={confirmingDelete ? 'Click again to confirm delete' : 'Delete task'}
                        style={{ padding: 4 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
