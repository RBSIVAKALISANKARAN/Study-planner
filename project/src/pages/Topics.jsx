import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { MasteryBadge } from '../lib/mastery.jsx';
import { formatLocalDate } from '../lib/dates.js';
import { Plus, ChevronDown, ChevronRight, Trash2, X, FileText } from 'lucide-react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

export default function Topics() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState({});
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [addTopicFor, setAddTopicFor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: subs } = await supabase.from('subjects').select('*').eq('user_id', user.id).order('created_at');
    setSubjects(subs || []);
    const { data: tops } = await supabase
      .from('topics')
      .select('*, review_states(next_review_date)')
      .eq('user_id', user.id)
      .order('created_at');
    const map = {};
    (tops || []).forEach((t) => {
      if (!map[t.subject_id]) map[t.subject_id] = [];
      map[t.subject_id].push(t);
    });
    setTopics(map);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function toggle(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  async function addSubject(name, color) {
    await supabase.from('subjects').insert({ user_id: user.id, name, color });
    setShowAddSubject(false);
    load();
  }

  async function addTopic(subjectId, name, description) {
    await supabase.from('topics').insert({ user_id: user.id, subject_id: subjectId, name, description: description || null });
    setAddTopicFor(null);
    load();
  }

  async function updateTopicDescription(topicId, description) {
    await supabase.from('topics').update({ description: description || null }).eq('id', topicId);
    setEditingTopic(null);
    load();
  }

  async function doDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'subject') {
      await supabase.from('subjects').delete().eq('id', deleteTarget.id);
    } else {
      await supabase.from('topics').delete().eq('id', deleteTarget.id);
    }
    setDeleteTarget(null);
    load();
  }

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Topics</h1>
        <button onClick={() => setShowAddSubject(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add subject
        </button>
      </div>

      {subjects.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No subjects yet. Create your first one to get started.</p>
          <button onClick={() => setShowAddSubject(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" /> Add subject
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {subjects.map((s) => (
            <div key={s.id} className="card overflow-hidden">
              <div className="flex items-center justify-between p-4" style={{ borderLeft: `4px solid ${s.color}` }}>
                <button onClick={() => toggle(s.id)} className="flex items-center gap-2 flex-1 text-left">
                  {expanded[s.id] ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <span className="w-3 h-3 rounded-full" style={{ background: s.color }}></span>
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-xs text-gray-400">({(topics[s.id] || []).length} topics)</span>
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={() => setAddTopicFor(s.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Add topic">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'subject', id: s.id, name: s.name })} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Delete subject">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {expanded[s.id] && (
                <div className="px-4 pb-4 space-y-2">
                  {(topics[s.id] || []).length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No topics yet.</p>
                  ) : (
                    (topics[s.id] || []).map((t) => (
                      <div key={t.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{t.name}</p>
                            <p className="text-xs text-gray-400">Next review: {t.review_states?.[0]?.next_review_date ? formatLocalDate(t.review_states[0].next_review_date) : 'Not set'}</p>
                            {t.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{t.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            <MasteryBadge score={t.current_mastery} />
                            <button
                              onClick={() => setEditingTopic(t)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-400 hover:text-blue-600"
                              title="Edit notes"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget({ type: 'topic', id: t.id, name: t.name })} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddSubject && <AddSubjectModal onClose={() => setShowAddSubject(false)} onAdd={addSubject} />}
      {addTopicFor && <AddTopicModal onClose={() => setAddTopicFor(null)} onAdd={(name, desc) => addTopic(addTopicFor, name, desc)} />}
      {deleteTarget && <ConfirmDeleteModal target={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={doDelete} />}
      {editingTopic && <EditNotesModal topic={editingTopic} onClose={() => setEditingTopic(null)} onSave={(desc) => updateTopicDescription(editingTopic.id, desc)} />}
    </div>
  );
}

function AddSubjectModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  return (
    <Modal onClose={onClose} title="Add subject">
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <button onClick={() => name && onAdd(name, color)} className="btn-primary w-full" disabled={!name}>Add</button>
      </div>
    </Modal>
  );
}

function AddTopicModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <Modal onClose={onClose} title="Add topic">
      <div className="space-y-4">
        <div>
          <label className="label">Topic name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Notes / key concepts (optional)</label>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Big-O notation, merge sort vs quick sort..." />
        </div>
        <button onClick={() => name && onAdd(name, description)} className="btn-primary w-full" disabled={!name}>Add</button>
      </div>
    </Modal>
  );
}

function EditNotesModal({ topic, onClose, onSave }) {
  const [description, setDescription] = useState(topic.description || '');
  return (
    <Modal onClose={onClose} title={`Notes — ${topic.name}`}>
      <div className="space-y-4">
        <div>
          <label className="label">Key concepts, formulas, or reminders</label>
          <textarea className="input" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should you remember when reviewing this topic?" autoFocus />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => onSave(description)} className="btn-primary flex-1">Save</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({ target, onCancel, onConfirm }) {
  return (
    <Modal onClose={onCancel} title="Confirm delete">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {target.type === 'subject'
            ? `Delete subject "${target.name}"? This will also delete all its topics and study history.`
            : `Delete topic "${target.name}"? This will also delete its review state and study history.`}
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} className="btn-danger flex-1">Delete</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
