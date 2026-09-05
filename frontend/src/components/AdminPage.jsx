import React, { useEffect, useState } from 'react';
import { adminApi, api, getAdminToken, setAdminToken } from '../api.js';

/* ------------------------------------------------------------------ */
/* Sous-composants d'édition                                           */
/* ------------------------------------------------------------------ */

function MethodologyEditor({ item, isNew, onSaved, onDeleted, onCancel }) {
  const [sectionId, setSectionId] = useState(item?.sectionId || '');
  const [title, setTitle] = useState(item?.title || '');
  const [order, setOrder] = useState(item?.order ?? 10);
  const [appliesToSteps, setAppliesToSteps] = useState((item?.appliesToSteps || []).join(','));
  const [content, setContent] = useState(item?.content || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    if (!sectionId.trim() || !title.trim() || !content.trim()) {
      setError('sectionId, titre et contenu sont obligatoires.');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      sectionId: sectionId.trim(),
      title: title.trim(),
      order: Number(order),
      appliesToSteps: appliesToSteps
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      content,
    };
    try {
      const saved = item
        ? await adminApi.put(`/api/admin/methodology/${item._id}`, payload)
        : await adminApi.post('/api/admin/methodology', payload);
      onSaved(saved, item ? false : true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return onCancel();
    if (!window.confirm(`Supprimer la section « ${item.title} » ?`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.del(`/api/admin/methodology/${item._id}`);
      onDeleted(item._id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className={`admin-item ${busy ? 'saving' : ''}`} onSubmit={save}>
      <div className="row-2">
        <label className="field">
          sectionId (slug unique)
          <input type="text" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!isNew} />
        </label>
        <label className="field">
          Title (affiché en admin)
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          Ordre d'assemblage
          <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </label>
        <label className="field">
          Étapes concernées (séparées par des virgules ; "all" = toutes)
          <input type="text" value={appliesToSteps} onChange={(e) => setAppliesToSteps(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Contenu (markdown) — injecté tel quel dans le prompt système
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} />
      </label>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {isNew ? (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
        ) : (
          <button type="button" className="btn-danger" onClick={remove} disabled={busy}>
            Supprimer
          </button>
        )}
      </div>
    </form>
  );
}

function StepSchemaEditor({ item, onSaved }) {
  const [description, setDescription] = useState(item.jsonSchemaDescription || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    if (!description.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await adminApi.put(`/api/admin/step-schemas/${item._id}`, {
        jsonSchemaDescription: description,
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`admin-item ${busy ? 'saving' : ''}`} onSubmit={save}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--cesi-primary)' }}>Étape : {item.stepKey}</strong>
        <span className="muted">Injecté à la fin du prompt système de l'étape</span>
      </div>
      <label className="field">
        Description du JSON attendu
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8} />
      </label>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Page Admin                                                          */
/* ------------------------------------------------------------------ */

function ThemeEditorItem({ item, onSaved, onDeleted }) {
  const [label, setLabel] = useState(item.label);
  const [order, setOrder] = useState(item.order);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = { ...item, label: label.trim(), order: Number(order) };
      await onSaved(item._id, updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer le thème « ${item.label} » ?`)) return;
    setBusy(true);
    try {
      await onDeleted(item._id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className={`admin-item ${busy ? 'saving' : ''}`} style={{ padding: 14 }}>
      <div className="row-2">
        <label className="field">
          Label
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="field">
          Ordre
          <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </label>
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="actions">
        <button type="button" className="btn-primary" onClick={save} disabled={busy || !label.trim()}>
          {busy ? '…' : 'Enregistrer'}
        </button>
        <button type="button" className="btn-danger" onClick={remove} disabled={busy}>
          Supprimer
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page Admin                                                          */
/* ------------------------------------------------------------------ */

export default function AdminPage() {
  const [token, setToken] = useState(getAdminToken());
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const [tab, setTab] = useState('methodology');
  const [sections, setSections] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [themes, setThemes] = useState([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [s, sc, t] = await Promise.all([
        adminApi.get('/api/admin/methodology'),
        adminApi.get('/api/admin/step-schemas'),
        adminApi.get('/api/admin/themes'),
      ]);
      setSections(s);
      setSchemas(sc);
      setThemes(t);
    } catch (err) {
      if (/authentifi|expir|Bearer/i.test(err.message)) {
        logout();
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function logout() {
    setAdminToken(null);
    setToken(null);
    setSections([]);
    setSchemas([]);
    setThemes([]);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      const data = await api.post('/api/admin/login', { password });
      setAdminToken(data.token);
      setToken(data.token);
      setPassword('');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginBusy(false);
    }
  }

  function handleSaved(saved, wasNew) {
    setSections((prev) => {
      if (wasNew) return [saved, ...prev];
      return prev.map((s) => (s._id === saved._id ? saved : s));
    });
  }

  function handleDeleted(id) {
    setSections((prev) => prev.filter((s) => s._id !== id));
  }

  async function saveTheme(id, updated) {
    // Le backend n'expose pas de PUT /themes/:id : on recrée mentalement…
    // Correction : PUT n'existant pas, on supprime puis on recrée.
    const old = themes.find((t) => t._id === id);
    await adminApi.del(`/api/admin/themes/${id}`);
    const created = await adminApi.post('/api/admin/themes', { label: updated.label, order: updated.order });
    setThemes((prev) => [created, ...prev.filter((t) => t._id !== id)].sort((a, b) => a.order - b.order));
    if (old) return old; // valeur ignorée
    return created;
  }

  async function deleteTheme(id) {
    await adminApi.del(`/api/admin/themes/${id}`);
    setThemes((prev) => prev.filter((t) => t._id !== id));
  }

  async function addTheme(e) {
    e.preventDefault();
    const label = e.target.label.value.trim();
    const order = Number(e.target.order.value || 0);
    if (!label) return;
    setError(null);
    try {
      const created = await adminApi.post('/api/admin/themes', { label, order });
      setThemes((prev) => [...prev, created].sort((a, b) => a.order - b.order));
      e.target.reset();
    } catch (err) {
      setError(err.message);
    }
  }

  /* ---------- Login ---------- */
  if (!token) {
    return (
      <div style={{ maxWidth: 440, margin: '40px auto' }}>
        <div className="card panel">
          <h1 className="page-title">Administration</h1>
          <p className="muted">Zone réservée — saisissez le mot de passe admin.</p>
          <form onSubmit={handleLogin}>
            <label className="field">
              Mot de passe admin
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </label>
            {loginError ? <div className="alert alert-error">{loginError}</div> : null}
            <button type="submit" className="btn-primary" disabled={loginBusy}>
              {loginBusy ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Administration</h1>
          <p className="muted">
            La méthodologie, les schémas de sortie et les thèmes sont stockés en base et injectés
            dynamiquement dans les prompts.
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={logout}>
          Se déconnecter
        </button>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'methodology' ? 'on' : ''}`} onClick={() => setTab('methodology')}>
          Méthodologie ({sections.length})
        </button>
        <button className={`tab ${tab === 'schemas' ? 'on' : ''}`} onClick={() => setTab('schemas')}>
          Schémas de sortie ({schemas.length})
        </button>
        <button className={`tab ${tab === 'themes' ? 'on' : ''}`} onClick={() => setTab('themes')}>
          Thèmes ({themes.length})
        </button>
      </div>

      {error ? (
        <div className="alert alert-error">
          {error}
          <button type="button" className="btn-ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>
            Fermer
          </button>
        </div>
      ) : null}
      {loading ? <p className="muted">Chargement…</p> : null}

      {tab === 'methodology' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            {!adding ? (
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                + Nouvelle section de méthodologie
              </button>
            ) : null}
          </div>
          {adding ? (
            <MethodologyEditor
              isNew
              onSaved={(saved) => {
                handleSaved(saved, true);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : null}
          {sections.map((s) => (
            <MethodologyEditor
              key={s._id}
              item={s}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      ) : null}

      {tab === 'schemas' ? (
        <div>
          {schemas.map((s) => (
            <StepSchemaEditor
              key={s._id}
              item={s}
              onSaved={(saved) => setSchemas((prev) => prev.map((x) => (x._id === saved._id ? saved : x)))}
            />
          ))}
        </div>
      ) : null}

      {tab === 'themes' ? (
        <div>
          <form className="admin-item" onSubmit={addTheme} style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 12, alignItems: 'end' }}>
            <label className="field" style={{ marginBottom: 0 }}>
              Nouveau thème
              <input type="text" name="label" placeholder="Ex. Mobilité & transports" required />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              Ordre
              <input type="number" name="order" defaultValue={themes.length + 1} />
            </label>
            <button type="submit" className="btn-primary" style={{ height: 42 }}>
              Ajouter
            </button>
          </form>
          {themes.map((t) => (
            <ThemeEditorItem key={t._id} item={t} onSaved={saveTheme} onDeleted={deleteTheme} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
