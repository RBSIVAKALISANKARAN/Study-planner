import { useState, useRef } from 'react';
import { X, Upload, FileText, Image, ChevronDown, ChevronUp, Loader as Loader2, Check, CircleAlert as AlertCircle, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

const DIFFICULTY_LABELS = { 1: 'Beginner', 2: 'Easy', 3: 'Intermediate', 4: 'Hard', 5: 'Expert' };
const MODES = [
  { id: 'text', label: 'Paste text', icon: FileText },
  { id: 'pdf', label: 'Upload PDF', icon: Upload },
  { id: 'image', label: 'Upload image', icon: Image },
];

export default function SyllabusUploadModal({ subjects, onClose, onSuccess }) {
  const { user, session } = useAuth();
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [step, setStep] = useState('input'); // input | parsing | review | confirming | done
  const [error, setError] = useState('');
  const [topics, setTopics] = useState([]);
  const [uploadId, setUploadId] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const fileRef = useRef(null);

  const authHeader = session?.access_token
    ? `Bearer ${session.access_token}`
    : '';

  const fnBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  // ── Step 1: parse ────────────────────────────────────────────────────
  async function handleParse() {
    setError('');
    if (mode === 'text' && !text.trim()) {
      setError('Please paste some syllabus text.');
      return;
    }
    if ((mode === 'pdf' || mode === 'image') && !file) {
      setError('Please choose a file.');
      return;
    }
    if (!subjectId) {
      setError('Please select a subject.');
      return;
    }

    setStep('parsing');

    try {
      let body;

      if (mode === 'text') {
        body = { text: text.trim() };
      } else {
        // Upload file to storage
        const storagePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('syllabus-uploads')
          .upload(storagePath, file, { upsert: false });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        // Create syllabus_uploads row with status pending
        await supabase.from('syllabus_uploads').insert({
          user_id: user.id,
          original_filename: file.name,
          storage_path: storagePath,
          status: 'pending',
        });

        body = { storage_path: storagePath };
      }

      const res = await fetch(`${fnBase}/parse-syllabus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!Array.isArray(data.topics) || data.topics.length === 0) {
        throw new Error('No topics were found in the syllabus.');
      }

      setTopics(data.topics.map((t) => ({ ...t, subject_id: subjectId })));
      setUploadId(data.upload_id ?? null);
      setStep('review');
    } catch (err) {
      setError(err.message);
      setStep('input');
    }
  }

  // ── Step 2: confirm ──────────────────────────────────────────────────
  async function handleConfirm() {
    setError('');
    setStep('confirming');
    try {
      const res = await fetch(`${fnBase}/parse-syllabus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ confirmed: true, topics, upload_id: uploadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStep('done');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message);
      setStep('review');
    }
  }

  // ── Topic list editing ───────────────────────────────────────────────
  function removeTopic(i) {
    setTopics((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateTopic(i, patch) {
    setTopics((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="card w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-lg">Import Syllabus</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {step === 'input' && 'Parse your syllabus with AI and create topics automatically.'}
              {step === 'parsing' && 'Analysing your syllabus…'}
              {step === 'review' && `${topics.length} topics found — review and edit before importing.`}
              {step === 'confirming' && 'Saving topics…'}
              {step === 'done' && 'Topics imported successfully!'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Input step ── */}
          {step === 'input' && (
            <>
              {/* Subject selector */}
              <div>
                <label className="label">Add topics to subject</label>
                <select
                  className="input"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Mode tabs */}
              <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                {MODES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => { setMode(id); setFile(null); setError(''); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                      mode === id
                        ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Text mode */}
              {mode === 'text' && (
                <textarea
                  className="input font-mono text-sm resize-none"
                  rows={12}
                  placeholder="Paste your course outline, module list, or syllabus here…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoFocus
                />
              )}

              {/* File modes */}
              {(mode === 'pdf' || mode === 'image') && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept={mode === 'pdf' ? '.pdf' : 'image/*'}
                    className="hidden"
                    onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }}
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-blue-600">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">{file.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Click to choose a {mode === 'pdf' ? 'PDF' : 'image'} file
                      </p>
                      <p className="text-xs text-gray-400">
                        {mode === 'pdf' ? 'PDF up to 10 MB' : 'JPG, PNG, or WebP'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </>
          )}

          {/* ── Parsing step ── */}
          {step === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Gemini is reading your syllabus…
              </p>
            </div>
          )}

          {/* ── Review step ── */}
          {(step === 'review' || step === 'confirming') && (
            <div className="space-y-3">
              {topics.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">
                  All topics removed. Go back to re-parse.
                </p>
              )}
              {topics.map((t, i) => (
                <TopicRow
                  key={i}
                  topic={t}
                  index={i}
                  editing={editingIdx === i}
                  onEdit={() => setEditingIdx(editingIdx === i ? null : i)}
                  onRemove={() => { removeTopic(i); if (editingIdx === i) setEditingIdx(null); }}
                  onChange={(patch) => updateTopic(i, patch)}
                />
              ))}

              {error && (
                <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Done step ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <Check className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <p className="font-medium text-green-700 dark:text-green-400">
                {topics.length} topic{topics.length !== 1 ? 's' : ''} imported!
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'input' || step === 'review' || step === 'confirming') && (
          <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
            {step === 'input' && (
              <>
                <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleParse}
                  className="btn-primary flex-1"
                  disabled={subjects.length === 0}
                >
                  Parse with AI
                </button>
              </>
            )}
            {(step === 'review' || step === 'confirming') && (
              <>
                <button
                  onClick={() => { setStep('input'); setError(''); }}
                  className="btn-secondary flex-1"
                  disabled={step === 'confirming'}
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  className="btn-primary flex-1"
                  disabled={topics.length === 0 || step === 'confirming'}
                >
                  {step === 'confirming' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  ) : (
                    `Import ${topics.length} topic${topics.length !== 1 ? 's' : ''}`
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TopicRow({ topic, editing, onEdit, onRemove, onChange }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{topic.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Difficulty: {DIFFICULTY_LABELS[topic.difficulty] ?? topic.difficulty} ·{' '}
            {topic.estimated_hours}h estimated
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-400 hover:text-blue-600 transition-colors"
            title="Edit"
          >
            {editing ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="px-4 py-3 space-y-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div>
            <label className="label">Topic name</label>
            <input
              className="input"
              value={topic.name}
              onChange={(e) => onChange({ name: e.target.value })}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={topic.description ?? ''}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Difficulty (1–5)</label>
              <select
                className="input"
                value={topic.difficulty}
                onChange={(e) => onChange({ difficulty: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>{v} — {DIFFICULTY_LABELS[v]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Est. hours</label>
              <input
                className="input"
                type="number"
                min={0}
                step={0.5}
                value={topic.estimated_hours ?? ''}
                onChange={(e) => onChange({ estimated_hours: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
