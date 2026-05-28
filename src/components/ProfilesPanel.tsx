import React, { useEffect, useState, useCallback, useRef } from 'react';
import { User, Users, Brain, Plus, Trash2, Edit2, X, Eye, Copy, Download, Check } from 'lucide-react';
import { useHermesClient } from '../lib/hermes';
import type { ProfileMeta, MemoryFileMeta } from '../lib/hermes';
import { useStore } from '../store';

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
  const client = useHermesClient();
  const { activeProfile, setActiveProfile } = useStore();
  const [tab, setTab] = useState<Tab>('profiles');

  // ── Profiles state ──
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── Rename state ──
  const [renamingProfile, setRenamingProfile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Delete confirmation state ──
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Memory state ──
  const [memFiles, setMemFiles] = useState<MemoryFileMeta[]>([]);
  const [memLoading, setMemLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [memConfirmDelete, setMemConfirmDelete] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const diskNames = await client.listProfileNames();
      let enriched: ProfileMeta[] = [];
      try {
        const clientData = await client.listProfiles();
        const clientMap = new Map(clientData.map((p) => [p.name, p]));
        enriched = diskNames.map((name) => clientMap.get(name) ?? { name, modified: '' });
      } catch {
        enriched = diskNames.map((name) => ({ name, modified: '' }));
      }
      setProfiles(enriched);
    } catch {
      try {
        setProfiles(await client.listProfiles());
      } catch {
        setProfiles([]);
        setProfilesError('Failed to load profiles.');
      }
    } finally {
      setProfilesLoading(false);
    }
  }, [client]);

  // ── Load memory files ──
  const loadMemFiles = useCallback(async () => {
    setMemLoading(true);
    try {
      const data = await client.listMemoryFiles();
      setMemFiles(data);
    } catch {
      setMemFiles([]);
    } finally {
      setMemLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadProfiles();
    loadMemFiles();
    client.getActiveProfile().then(setActiveProfile).catch(() => {});
  }, [loadProfiles, loadMemFiles, client, setActiveProfile]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingProfile !== null) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingProfile]);

  // ── Create profile ──
  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await client.createProfile(name);
      if (!result.success) {
        setCreateError(result.stderr || `Failed to create profile "${name}"`);
        setCreating(false);
        return;
      }
      // Also write default content via client so the profile file exists
      try {
        await client.writeProfile(name, DEFAULT_PROFILE_CONTENT);
      } catch {
        // non-fatal — directory was created, content write is best-effort
      }
      setNewName('');
      setShowCreateForm(false);
      await loadProfiles();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unknown error creating profile');
    } finally {
      setCreating(false);
    }
  };

  // ── Edit profile (content editor) ──
  const handleEditOpen = async (name: string) => {
    const content = await client.readProfile(name);
    setEditContent(content);
    setEditingName(name);
  };

  const handleEditSave = async () => {
    if (!editingName || editSaving) return;
    setEditSaving(true);
    await client.writeProfile(editingName, editContent);
    setEditSaving(false);
    setEditingName(null);
    setEditContent('');
  };

  // ── Delete profile ──
  const handleDelete = async (name: string) => {
    if (deleteConfirm !== name) {
      // First click — show inline confirmation
      setDeleteConfirm(name);
      setDeleteError(null);
      return;
    }
    // Second click — confirmed, proceed
    setDeleteError(null);
    try {
      await client.deleteProfile(name);
      setDeleteConfirm(null);
      await loadProfiles();
      if (editingName === name) { setEditingName(null); setEditContent(''); }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
      setDeleteConfirm(null);
    }
  };

  // ── Rename profile ──
  const startRename = (name: string) => {
    setRenamingProfile(name);
    setRenameValue(name);
    setRenameError(null);
  };

  const commitRename = async () => {
    if (!renamingProfile) return;
    const newNameTrimmed = renameValue.trim();
    if (!newNameTrimmed || newNameTrimmed === renamingProfile) {
      setRenamingProfile(null);
      return;
    }
    setRenameError(null);
    try {
      const result = await client.renameProfile(renamingProfile, newNameTrimmed);
      if (!result.success) {
        setRenameError(`Rename failed: ${result.stderr || 'unknown error'}`);
        return;
      }
      // Update active profile reference if this was the active one
      if (activeProfile === renamingProfile) {
        await client.setActiveProfile(newNameTrimmed).catch(() => {});
        setActiveProfile(newNameTrimmed);
      }
      setRenamingProfile(null);
      await loadProfiles();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const cancelRename = () => {
    setRenamingProfile(null);
    setRenameValue('');
    setRenameError(null);
  };

  // ── Duplicate profile ──
  const handleDuplicate = async (name: string) => {
    await client.runHermesCommand(['profile', 'copy', name, `${name}-copy`]);
    await loadProfiles();
  };

  // ── Export profile ──
  const handleExport = async (name: string) => {
    try {
      const content = await client.readFile(`profiles/${name}/config.yaml`);
      if (!content) return;
      const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail if file not found
    }
  };

  // ── Memory preview ──
  const handlePreview = async (name: string) => {
    setPreviewFile(name);
    setPreviewLoading(true);
    try {
      const content = await client.readMemoryFile(name);
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
    await client.deleteMemoryFile(name);
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
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span className="section-label" style={{ margin: 0 }}>Saved Profiles</span>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setShowCreateForm((v) => !v); setNewName(''); setCreateError(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={13} />
                New Profile
              </button>
            </div>

            {/* Top-level error */}
            {profilesError && (
              <div className="badge badge-error" style={{ display: 'block', marginBottom: 12, padding: '6px 10px', fontSize: 12 }}>
                {profilesError}
              </div>
            )}

            {/* Delete error */}
            {deleteError && (
              <div className="badge badge-error" style={{ display: 'block', marginBottom: 12, padding: '6px 10px', fontSize: 12 }}>
                {deleteError}
              </div>
            )}

            {/* Rename error */}
            {renameError && (
              <div className="badge badge-error" style={{ display: 'block', marginBottom: 12, padding: '6px 10px', fontSize: 12 }}>
                {renameError}
              </div>
            )}

            {/* Inline create form */}
            {showCreateForm && (
              <div style={{
                background: 'var(--bg1)',
                border: '1px solid var(--border-active)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                marginBottom: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input-field"
                    placeholder="Profile name…"
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setCreateError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                      if (e.key === 'Escape') { setShowCreateForm(false); setNewName(''); setCreateError(null); }
                    }}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setShowCreateForm(false); setNewName(''); setCreateError(null); }}
                  >
                    <X size={13} />
                  </button>
                </div>
                {createError && (
                  <div className="badge badge-error" style={{ fontSize: 11, padding: '4px 8px' }}>
                    {createError}
                  </div>
                )}
              </div>
            )}

            {profilesLoading && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>
                Loading…
              </div>
            )}

            {!profilesLoading && profiles.length === 0 && (
              <div style={{
                padding: '40px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: 13,
                background: 'var(--bg1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <Users size={28} style={{ color: 'var(--text-tertiary)', marginBottom: 10 }} />
                <div style={{ fontWeight: 500, marginBottom: 4 }}>No profiles yet</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 14 }}>
                  Create your first profile to give Hermes context about who you are.
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCreateForm(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={13} />
                  Create your first profile
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profiles.map((p) => (
                <div key={p.name}>
                  <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div className="profile-avatar" style={{ width: 28, height: 28, fontSize: 11, borderRadius: 6, flexShrink: 0 }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {/* Inline rename — double-click to activate */}
                        {renamingProfile === p.name ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              ref={renameInputRef}
                              className="input-field"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') cancelRename();
                              }}
                              onBlur={commitRename}
                              style={{ fontSize: 13, padding: '3px 7px', flex: 1 }}
                            />
                            <button
                              className="btn btn-icon btn-ghost btn-sm"
                              onMouseDown={(e) => { e.preventDefault(); commitRename(); }}
                              title="Confirm rename"
                            >
                              <Check size={12} style={{ color: 'var(--accent-green)' }} />
                            </button>
                            <button
                              className="btn btn-icon btn-ghost btn-sm"
                              onMouseDown={(e) => { e.preventDefault(); cancelRename(); }}
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: p.name === 'default' ? 'default' : 'text' }}
                            onDoubleClick={() => { if (p.name !== 'default') startRename(p.name); }}
                            title={p.name !== 'default' ? 'Double-click to rename' : undefined}
                          >
                            {p.name}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          {p.modified && (
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                              {p.modified}
                            </span>
                          )}
                          {p.name === 'default' && (
                            <span className="badge badge-muted" style={{ fontSize: 10, padding: '1px 6px' }}>Default</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      {activeProfile === p.name ? (
                        <span className="badge badge-connected" style={{ fontSize: 10, padding: '2px 8px' }}>Active</span>
                      ) : (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => client.setActiveProfile(p.name).then(() => setActiveProfile(p.name)).catch(() => setActiveProfile(p.name))}
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                          title="Set as active profile"
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleEditOpen(p.name)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Edit content"
                      >
                        <Edit2 size={12} />
                        Edit
                      </button>
                      <button
                        className="btn btn-icon btn-ghost btn-sm"
                        onClick={() => handleDuplicate(p.name)}
                        title="Duplicate"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        className="btn btn-icon btn-ghost btn-sm"
                        onClick={() => handleExport(p.name)}
                        title="Export profile"
                      >
                        <Download size={12} />
                      </button>
                      {p.name !== 'default' && (
                        <>
                          {deleteConfirm === p.name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 11, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                                Confirm?
                              </span>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(p.name)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Trash2 size={11} />
                                Delete
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-icon btn-ghost btn-sm"
                              onClick={() => handleDelete(p.name)}
                              style={{ color: 'var(--accent-red)' }}
                              title="Delete profile"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline content editor */}
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
