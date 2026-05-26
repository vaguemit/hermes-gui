import React, { useEffect, useRef, useState } from 'react';
import { Plus, X, Tag, GripVertical, Calendar, Flag } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'low' | 'medium' | 'high' | 'urgent';
type TaskStatus = 'triage' | 'todo' | 'ready' | 'running' | 'blocked' | 'done';

interface KanbanTask {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  status: TaskStatus;
  assignee?: string;
  createdAt: number;
  completedAt?: number;
  dueDate?: string; // ISO date string YYYY-MM-DD
  tags: string[];
}

interface KanbanBoard {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  tasks: KanbanTask[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERSIST_KEY = 'hermes_kanban_boards';

const BOARD_ICONS = ['📋', '🚀', '💡', '🔧', '📊', '🎯'];

const DEFAULT_BOARDS: KanbanBoard[] = [
  {
    id: 'main',
    name: 'Main',
    description: 'Main task board',
    icon: '📋',
    color: 'var(--accent-green)',
    tasks: [],
  },
];

interface ColumnDef {
  id: TaskStatus;
  label: string;
  accentColor?: string;
}

const COLUMNS: ColumnDef[] = [
  { id: 'triage',  label: 'Triage',  accentColor: 'var(--text-secondary)' },
  { id: 'todo',    label: 'To-do',   accentColor: 'var(--text-primary)'   },
  { id: 'ready',   label: 'Ready',   accentColor: 'var(--accent-blue)'    },
  { id: 'running', label: 'Running', accentColor: 'var(--accent-amber)'   },
  { id: 'blocked', label: 'Blocked', accentColor: 'var(--accent-red)'     },
  { id: 'done',    label: 'Done',    accentColor: 'var(--accent-green)'   },
];

// Priority colour config
const PRIORITY_COLORS: Record<Priority, string> = {
  low:    'var(--text-tertiary)',
  medium: 'var(--accent-blue)',
  high:   'var(--accent-amber)',
  urgent: 'var(--accent-red)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDueDate(iso: string): string {
  // Format YYYY-MM-DD → "Mon DD"
  try {
    const [year, month, day] = iso.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function loadBoards(): KanbanBoard[] {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_BOARDS;
}

function saveBoards(boards: KanbanBoard[]) {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(boards));
  } catch {
    // ignore quota errors
  }
}

// ---------------------------------------------------------------------------
// PriorityBadge
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'urgent') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 10.5, fontWeight: 700,
        color: 'var(--accent-red)',
        whiteSpace: 'nowrap',
      }}>
        <Flag size={9} style={{ color: 'var(--accent-red)' }} />
        Urgent
      </span>
    );
  }

  const color = PRIORITY_COLORS[priority];
  const label = priority === 'high' ? 'High' : priority === 'medium' ? 'Medium' : 'Low';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10.5, color, whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color, flexShrink: 0, display: 'inline-block',
      }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Priority radio dot picker
// ---------------------------------------------------------------------------

function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  const options: { value: Priority; color: string; label: string }[] = [
    { value: 'low',    color: 'var(--text-tertiary)', label: 'Low'    },
    { value: 'medium', color: 'var(--accent-blue)',   label: 'Medium' },
    { value: 'high',   color: 'var(--accent-amber)',  label: 'High'   },
    { value: 'urgent', color: 'var(--accent-red)',    label: 'Urgent' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Flag size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
      {options.map((opt) => (
        <label
          key={opt.value}
          title={opt.label}
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}
        >
          <input
            type="radio"
            name="priority-pick"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            style={{ display: 'none' }}
          />
          <span style={{
            width: 11, height: 11, borderRadius: '50%',
            background: opt.color,
            border: value === opt.value
              ? `2px solid var(--text-primary)`
              : `2px solid transparent`,
            outline: value === opt.value ? `1px solid ${opt.color}` : 'none',
            outlineOffset: 1,
            transition: 'border-color 0.12s',
            display: 'inline-block',
            flexShrink: 0,
          }} />
          {value === opt.value && <span style={{ color: opt.color, fontSize: 10.5 }}>{opt.label}</span>}
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddTaskForm
// ---------------------------------------------------------------------------

interface AddTaskFormProps {
  columnId: TaskStatus;
  onSave: (task: Omit<KanbanTask, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

function AddTaskForm({ columnId, onSave, onCancel }: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assignee, setAssignee] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [dueDate, setDueDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const handleSave = () => {
    if (!title.trim()) return;
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    onSave({
      title: title.trim(),
      body: '',
      priority,
      status: columnId,
      assignee: assignee.trim() || undefined,
      dueDate: dueDate || undefined,
      tags,
    });
  };

  return (
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
        ref={inputRef}
        className="input-field"
        placeholder="Task title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') onCancel();
        }}
        style={{ fontSize: 12.5, padding: '6px 9px' }}
      />

      {/* Priority picker */}
      <PriorityPicker value={priority} onChange={setPriority} />

      {/* Due date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Calendar size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="input-field"
          style={{
            fontSize: 11.5, padding: '4px 8px', flex: 1,
            colorScheme: 'dark',
          }}
        />
      </div>

      <input
        className="input-field"
        placeholder="Assignee (optional)"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        style={{ fontSize: 12, padding: '5px 9px' }}
      />

      <input
        className="input-field"
        placeholder="Tags, comma-separated (optional)"
        value={tagsRaw}
        onChange={(e) => setTagsRaw(e.target.value)}
        style={{ fontSize: 12, padding: '5px 9px' }}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={!title.trim()}
          style={{ flex: 1, fontSize: 12 }}
        >
          Save
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={onCancel}
          style={{ padding: '4px 8px' }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: KanbanTask;
  onMove: (taskId: string, status: TaskStatus) => void;
  onDelete: (taskId: string) => void;
  onEditTitle: (taskId: string, newTitle: string) => void;
  onDragStart: (e: React.DragEvent, taskId: string, fromStatus: TaskStatus) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function TaskCard({ task, onMove, onDelete, onEditTitle, onDragStart, onDragEnd }: TaskCardProps) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const isDone = task.status === 'done';

  // Focus textarea when editing starts
  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== task.title) {
      onEditTitle(task.id, trimmed);
    } else {
      setEditValue(task.title); // revert if empty or unchanged
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditValue(task.title);
    setEditing(false);
  };

  const handleDeleteClick = () => {
    if (confirmDelete) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      onDelete(task.id);
    } else {
      setConfirmDelete(true);
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  // cleanup
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  return (
    <div
      className="animate-in"
      draggable
      onDragStart={(e) => onDragStart(e, task.id, task.status)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--bg2)' : 'var(--bg1)',
        border: `1px solid ${hovered ? 'var(--border-hover)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
        cursor: 'grab',
        userSelect: 'none',
      }}
    >
      {/* Drag handle + title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <GripVertical
          size={13}
          style={{
            color: 'var(--text-tertiary)',
            flexShrink: 0,
            marginTop: 1,
            cursor: 'grab',
          }}
        />
        {editing ? (
          <textarea
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') cancelEdit();
            }}
            onBlur={commitEdit}
            rows={2}
            style={{
              flex: 1,
              background: 'var(--bg3)',
              border: '1px solid var(--border-active)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              lineHeight: 1.4,
              padding: '3px 6px',
              resize: 'none',
              cursor: 'text',
              userSelect: 'text',
            }}
          />
        ) : (
          <span
            title="Double-click to edit"
            onDoubleClick={() => { setEditing(true); setEditValue(task.title); }}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: isDone ? 'var(--text-secondary)' : 'var(--text-primary)',
              textDecoration: isDone ? 'line-through' : 'none',
              opacity: isDone ? 0.6 : 1,
              lineHeight: 1.4,
              wordBreak: 'break-word',
              cursor: 'pointer',
            }}
          >
            {task.title}
          </span>
        )}
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Due date chip */}
      {task.dueDate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={10} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
            {formatDueDate(task.dueDate)}
          </span>
        </div>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <Tag size={11} style={{ color: 'var(--text-tertiary)', marginTop: 2, flexShrink: 0 }} />
          {task.tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: 'var(--bg4)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 10.5,
                color: 'var(--text-secondary)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Assignee */}
      {task.assignee && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--bg4)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700,
            color: 'var(--text-secondary)',
            flexShrink: 0,
            textTransform: 'uppercase',
          }}>
            {task.assignee[0]}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{task.assignee}</span>
        </div>
      )}

      {/* Bottom row: move selector + delete + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <select
          value={task.status}
          onChange={(e) => onMove(task.id, e.target.value as TaskStatus)}
          style={{
            flex: 1,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            color: 'var(--text-secondary)',
            fontSize: 11,
            padding: '3px 6px',
            cursor: 'pointer',
          }}
          title="Move to column"
        >
          {COLUMNS.map((col) => (
            <option key={col.id} value={col.id}>{col.label}</option>
          ))}
        </select>

        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {relativeTime(task.createdAt)}
        </span>

        <button
          className={confirmDelete ? 'btn btn-danger btn-icon btn-sm' : 'btn btn-ghost btn-icon btn-sm'}
          onClick={handleDeleteClick}
          title={confirmDelete ? 'Click again to confirm' : 'Delete task'}
          style={{ padding: 4, flexShrink: 0 }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function KanbanPanel() {
  const [boards, setBoards] = useState<KanbanBoard[]>(() => loadBoards());
  const [activeBoardId, setActiveBoardId] = useState<string>(() => loadBoards()[0]?.id ?? 'main');
  const [addingColumn, setAddingColumn] = useState<TaskStatus | null>(null);

  // New board form state
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardIcon, setNewBoardIcon] = useState(BOARD_ICONS[0]);
  const newBoardInputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const dragCardId = useRef<string | null>(null);
  const dragFromStatus = useRef<TaskStatus | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  // Persist on every boards change
  useEffect(() => {
    saveBoards(boards);
  }, [boards]);

  // Focus new board input
  useEffect(() => {
    if (newBoardOpen) {
      setTimeout(() => newBoardInputRef.current?.focus(), 30);
    }
  }, [newBoardOpen]);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0];

  const updateActiveBoard = (updater: (b: KanbanBoard) => KanbanBoard) => {
    setBoards((prev) => prev.map((b) => b.id === activeBoardId ? updater(b) : b));
  };

  const handleAddTask = (task: Omit<KanbanTask, 'id' | 'createdAt'>) => {
    const newTask: KanbanTask = { ...task, id: genId(), createdAt: Date.now() };
    updateActiveBoard((b) => ({ ...b, tasks: [newTask, ...b.tasks] }));
    setAddingColumn(null);
  };

  const handleMoveTask = (taskId: string, status: TaskStatus) => {
    updateActiveBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          status,
          completedAt: status === 'done' ? Date.now() : undefined,
        };
      }),
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    updateActiveBoard((b) => ({ ...b, tasks: b.tasks.filter((t) => t.id !== taskId) }));
  };

  const handleEditTitle = (taskId: string, newTitle: string) => {
    updateActiveBoard((b) => ({
      ...b,
      tasks: b.tasks.map((t) => t.id === taskId ? { ...t, title: newTitle } : t),
    }));
  };

  const handleCreateBoard = () => {
    if (!newBoardName.trim()) return;
    const board: KanbanBoard = {
      id: genId(),
      name: newBoardName.trim(),
      description: '',
      icon: newBoardIcon,
      color: 'var(--accent-green)',
      tasks: [],
    };
    setBoards((prev) => [...prev, board]);
    setActiveBoardId(board.id);
    setNewBoardName('');
    setNewBoardIcon(BOARD_ICONS[0]);
    setNewBoardOpen(false);
  };

  // ── Drag handlers ──────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, taskId: string, fromStatus: TaskStatus) => {
    dragCardId.current = taskId;
    dragFromStatus.current = fromStatus;
    // Use ghost image default; reduce opacity via style on the card's parent
    e.dataTransfer.effectAllowed = 'move';
    // Mark dragging element
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '';
    dragCardId.current = null;
    dragFromStatus.current = null;
    setDragOverColumn(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(colId);
  };

  const handleColumnDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column container itself (not a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
    }
  };

  const handleColumnDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const cardId = dragCardId.current;
    const fromStatus = dragFromStatus.current;
    if (!cardId || !fromStatus || fromStatus === targetStatus) return;
    handleMoveTask(cardId, targetStatus);
  };

  if (!activeBoard) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg0)' }}>

      {/* Board selector bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        {boards.map((board) => (
          <button
            key={board.id}
            onClick={() => setActiveBoardId(board.id)}
            className={board.id === activeBoardId ? 'tab-btn active' : 'tab-btn'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, whiteSpace: 'nowrap' }}
          >
            <span>{board.icon}</span>
            <span>{board.name}</span>
          </button>
        ))}

        {/* New board button / form */}
        {newBoardOpen ? (
          <div
            className="animate-in"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--bg2)',
              border: '1px solid var(--border-active)',
              borderRadius: 8,
              padding: '4px 8px',
              flexShrink: 0,
            }}
          >
            {/* Icon picker */}
            <div style={{ display: 'flex', gap: 2 }}>
              {BOARD_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setNewBoardIcon(icon)}
                  style={{
                    background: newBoardIcon === icon ? 'var(--bg4)' : 'transparent',
                    border: newBoardIcon === icon ? '1px solid var(--border-active)' : '1px solid transparent',
                    borderRadius: 4,
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: 13,
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              ref={newBoardInputRef}
              className="input-field"
              placeholder="Board name…"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateBoard();
                if (e.key === 'Escape') { setNewBoardOpen(false); setNewBoardName(''); }
              }}
              style={{ width: 120, fontSize: 12, padding: '4px 8px' }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCreateBoard}
              disabled={!newBoardName.trim()}
              style={{ fontSize: 11 }}
            >
              Create
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => { setNewBoardOpen(false); setNewBoardName(''); }}
              style={{ padding: '3px 5px' }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setNewBoardOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, flexShrink: 0 }}
          >
            <Plus size={12} />
            New Board
          </button>
        )}
      </div>

      {/* Board description */}
      {activeBoard.description && (
        <div style={{
          padding: '6px 16px',
          fontSize: 11.5,
          color: 'var(--text-tertiary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {activeBoard.description}
        </div>
      )}

      {/* Columns */}
      <div style={{ display: 'flex', flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: 16, gap: 12 }}>
        {COLUMNS.map((col) => {
          const colTasks = activeBoard.tasks.filter((t) => t.status === col.id);
          const isAdding = addingColumn === col.id;
          const isDragOver = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleColumnDragOver(e, col.id)}
              onDragLeave={handleColumnDragLeave}
              onDrop={(e) => handleColumnDrop(e, col.id)}
              style={{
                minWidth: 200,
                width: 220,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg1)',
                border: `1px solid ${isDragOver ? 'var(--accent-blue)' : 'var(--border)'}`,
                borderRadius: 12,
                overflow: 'hidden',
                transition: 'border-color 0.15s',
                boxShadow: isDragOver ? '0 0 0 2px var(--accent-blue-dim)' : 'none',
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
                <span style={{
                  fontWeight: 600, fontSize: 13,
                  color: col.accentColor ?? 'var(--text-primary)',
                  flex: 1,
                }}>
                  {col.label}
                </span>
                {/* Card count badge */}
                <span
                  className="badge badge-muted"
                  style={{ fontSize: 10, fontFamily: 'var(--font-mono)', minWidth: 20, textAlign: 'center' }}
                >
                  {colTasks.length}
                </span>
              </div>

              {/* Task list (scrollable) */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {colTasks.length === 0 && !isAdding && (
                  <div style={{
                    color: isDragOver ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                    fontSize: 11.5, textAlign: 'center', marginTop: 20, userSelect: 'none',
                    transition: 'color 0.15s',
                  }}>
                    {isDragOver ? 'Drop here' : 'No tasks'}
                  </div>
                )}
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onMove={handleMoveTask}
                    onDelete={handleDeleteTask}
                    onEditTitle={handleEditTitle}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>

              {/* Inline add form or add button */}
              {isAdding ? (
                <AddTaskForm
                  columnId={col.id}
                  onSave={handleAddTask}
                  onCancel={() => setAddingColumn(null)}
                />
              ) : (
                <div style={{ padding: '6px 10px 10px', flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setAddingColumn(col.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
                  >
                    <Plus size={13} />
                    Add Task
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
