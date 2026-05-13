import React, { useEffect, useState, useCallback } from 'react';
import { User, Brain, Plus, Trash2, Edit2, X, Eye } from 'lucide-react';
import {
  listProfiles,
  readProfile,
  writeProfile,
  deleteProfile,
  listMemoryFiles,
  readMemoryFile,
  deleteMemoryFile,
} from '../api/desktop';
import type { ProfileMeta, MemoryFileMeta } from '../api/desktop';

const DEFAULT_PROFILE_CONTENT = `# Profile

## About Me
<!-- Describe yourself, your role, and how you use Hermes -->

## Preferences
<!-- Communication style, task preferences, etc. -->

## Context
<!-- Ongoing projects or background info Hermes should know -->
`;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Tab = 'profiles' | 'memory';

export default function ProfilesPanel() {
  const [tab, setTab] = useState<Tab>('profiles');

  // ── Profiles state ──
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Memory state ──
  const [memFiles, setMemFiles] = useState<MemoryFileMeta[]>([]);
  const [memLoading, setMemLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [memConfirmDelete, setMemConfirmDelete] = useState<string | null>(null);

  // ── Load profiles ──
  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const data = await listProfiles();
      setProfiles(data);
    } catch {
      setProfiles([]);
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  // ── Load memory files ──
  const loadMemFiles = useCallback(async () => {
    setMemLoading(true);
    try {
      const data = await listMemoryFiles();
      setMemFiles(data);
    } catch {
      setMemFiles([]);
    } finally {
      setMemLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
    loadMemFiles();
  }, [loadProfiles, loadMemFiles]);

  // ── Create profile ──
  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    await writeProfile(name, DEFAULT_PROFILE_CONTENT);
    setNewName('');
    await loadProfiles();
    setCreating(false);
  };

  // ── Edit profile ──
  const handleEditOpen = async (name: string) => {
    const content = await readProfile(name);
    setEditContent(content);
    setEditingName(name);
  };

  const handleEditSave = async () => {
    if (!editingName || editSaving) return;
    setEditSaving(true);
    await writeProfile(editingName, editContent);
    setEditSaving(false);
    setEditingName(null);
    setEditContent('');
  };

  // ── Delete profile ──
  const handleDelete = async (name: string) => {
    if (confirmDelete !== name) {
      setConfirmDelete(name);
      return;
    }
    await deleteProfile(name);
    setConfirmDelete(null);
    await loadProfiles();
    if (editingName === name) { setEditingName(null); setEditContent(''); }
  };

  // ── Memory preview ──
  const handlePreview = async (name: string) => {
    setPreviewFile(name);
    setPreviewLoading(true);
    try {
      const content = await readMemoryFile(name);
      setPreviewContent(content);
    } catch {
      setPreviewContent('Failed to load file.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Memory delete ──
  const handleMemDelete = async (name: string) => {
    if (memConfirmDelete !== name) { setMemConfirmDelete(name); return; }
    await deleteMemoryFile(name);
    setMemConfirmDelete(null);
    await loadMemFiles();
  };

  // ── Tab switch reload ──
  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t === 'profiles') loadProfiles();
    else loadMemFiles();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '12px 20px 0',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg1)',
        flexShrink: 0,
      }}>
        <button
          className={`tab-btn${tab === 'profiles' ? ' active' : ''}`}
          onClick={() => handleTabChange('profiles')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <User size={13} /> Profiles
        </button>
        <button
          className={`tab-btn${tab === 'memory' ? ' active' : ''}`}
          onClick={() => handleTabChange('memory')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Brain size={13} /> Memory
        </button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

        {/* ── PROFILES TAB ── */}
        {tab === 'profiles' && (
          <div>
            {/* Create form */}
            <div className="section-label">New Profile</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              <input
                className="input-field"
                placeholder="Profile name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={13} />
                Create
              </button>
            </div>

            {/* Profile list */}
            <div className="section-label">Saved Profiles</div>

            {profilesLoading && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>
                Loading…
              </div>
            )}

            {!profilesLoading && profiles.length === 0 && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: 13,
                background: 'var(--bg1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <User size={28} style={{ color: 'var(--text-tertiary)', marginBottom: 10 }} />
                <div style={{ fontWeight: 500, marginBottom: 4 }}>No profiles yet</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                  Create a profile to give Hermes context about who you are.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profiles.map((p) => (
                <div key={p.name}>
                  <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div className="profile-avatar" style={{ width: 28, height: 28, fontSize: 11, borderRadius: 6 }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {p.modified}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      {confirmDelete === p.name ? (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
                            Click again to confirm
                          </span>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(p.name)}
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setConfirmDelete(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleEditOpen(p.name)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                          >
                            <Edit2 size={12} />
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDelete(p.name)}
                            style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 5 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline editor */}
                  {editingName === p.name && (
                    <div style={{
                      marginTop: 6,
                      background: 'var(--bg1)',
                      border: '1px solid var(--border-active)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 14px',
                        background: 'var(--bg2)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {p.name}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={handleEditSave}
                            disabled={editSaving}
                          >
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingName(null); setEditContent(''); }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: 280,
                          background: 'var(--bg0)',
                          border: 'none',
                          outline: 'none',
                          padding: '14px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--text-primary)',
                          lineHeight: 1.75,
                          resize: 'vertical',
                          display: 'block',
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MEMORY TAB ── */}
        {tab === 'memory' && (
          <div>
            <div className="section-label">Memory Files</div>

            {memLoading && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>
                Loading…
              </div>
            )}

            {!memLoading && memFiles.length === 0 && (
              <div style={{
                padding: '40px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: 13,
                background: 'var(--bg1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <Brain size={28} style={{ color: 'var(--text-tertiary)', marginBottom: 10 }} />
                <div style={{ fontWeight: 500, marginBottom: 6 }}>No memory files</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
                  Hermes stores long-term memory here as the agent learns about you and your preferences.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {memFiles.map((f) => (
                <div
                  key={f.name}
                  className="card"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.name}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {formatSize(f.size)}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {f.modified}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    {memConfirmDelete === f.name ? (
                      <>
                        <span style={{ fontSize: 11, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
                          Click again to confirm
                        </span>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleMemDelete(f.name)}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setMemConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handlePreview(f.name)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          <Eye size={12} />
                          View
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleMemDelete(f.name)}
                          style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Memory preview modal */}
      {previewFile !== null && (
        <div
          className="palette-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) { setPreviewFile(null); setPreviewContent(''); } }}
        >
          <div style={{
            background: 'var(--bg1)',
            border: '1px solid var(--border-hover)',
            borderRadius: 'var(--radius-lg)',
            width: '90%',
            maxWidth: 640,
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg2)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {previewFile}
              </span>
              <button
                className="btn-icon btn btn-ghost"
                onClick={() => { setPreviewFile(null); setPreviewContent(''); }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: previewLoading ? 'var(--text-tertiary)' : 'var(--text-primary)',
              lineHeight: 1.75,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {previewLoading ? 'Loading…' : (previewContent || '(empty file)')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
