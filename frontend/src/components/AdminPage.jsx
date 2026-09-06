import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

/* ------------------------------------------------------------------ */
/* Éditeur : MethodologySection                                        */
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
        ? await api.put(`/api/admin/methodology/${item._id}`, payload)
        : await api.post('/api/admin/methodology', payload);
      onSaved(saved, !item);
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
      await api.del(`/api/admin/methodology/${item._id}`);
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

/* ------------------------------------------------------------------ */
/* Éditeur : StepSchema                                                */
/* ------------------------------------------------------------------ */

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
      const saved = await api.put(`/api/admin/step-schemas/${item._id}`, {
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
/* Éditeur : Theme                                                     */
/* ------------------------------------------------------------------ */

function ThemeEditorItem({ item, onSaved, onDeleted }) {
  const [label, setLabel] = useState(item.label);
  const [order, setOrder] = useState(item.order);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Pas de PUT /themes/:id côté API : suppression + recréation.
      await api.del(`/api/admin/themes/${item._id}`);
      const created = await api.post('/api/admin/themes', { label: label.trim(), order: Number(order) });
      onSaved(created);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer le thème « ${item.label} » ?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/admin/themes/${item._id}`);
      onDeleted(item._id);
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
/* Éditeur : Source News (veille IA / Big Data)                        */
/* ------------------------------------------------------------------ */

function NewsSourceEditor({ item, onSaved, onDeleted }) {
  const [name, setName] = useState(item.name || '');
  const [url, setUrl] = useState(item.url || '');
  const [active, setActive] = useState(item.active !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const saved = item
        ? await api.put(`/api/admin/news-sources/${item._id}`, { name: name.trim(), url: url.trim(), active })
        : await api.post('/api/admin/news-sources', { name: name.trim(), url: url.trim(), active });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!window.confirm(`Supprimer la source « ${item.name} » ?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/admin/news-sources/${item._id}`);
      onDeleted(item._id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className={`admin-item ${busy ? 'saving' : ''}`} style={{ padding: 14 }}>
      <div className="row-2">
        <label className="field">
          Nom de la source
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          URL (page, flux RSS ou catégorie)
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
      </div>
      <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          style={{ width: 'auto' }}
        />
        Source active (interrogée par le scraping quotidien)
      </label>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="actions">
        <button type="button" className="btn-primary" onClick={save} disabled={busy || !name.trim() || !url.trim()}>
          {busy ? '…' : item ? 'Enregistrer' : 'Ajouter'}
        </button>
        {item ? (
          <button type="button" className="btn-danger" onClick={remove} disabled={busy}>
            Supprimer
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau : scraping News (déclenchement manuel)                      */
/* ------------------------------------------------------------------ */

function NewsScanPanel({ onScan }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  async function launch() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const r = await onScan();
      setReport(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-item">
      <h3 style={{ marginTop: 0 }}>Collecte quotidienne des articles</h3>
      <p className="muted">
        Le cron quotidien interroge automatiquement les sources actives (6h30, Europe/Paris).
        Ce bouton déclenche immédiatement le même processus (collecte + glossaire du jour), sans
        attendre le cron.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="btn-primary" onClick={launch} disabled={busy}>
          {busy ? (
            <>
              <span className="spin" /> Scraping en cours…
            </>
          ) : (
            'Lancer le scraping manuellement'
          )}
        </button>
      </div>
      {report ? (
        <div className="news-status" style={{ marginTop: 12 }}>
          <strong>Dernière collecte ({report.date || '—'})</strong> : {report.totalNouveaux} nouvel(le)(s)
          article(s) récupéré(s), {report.doublonsIgnores} doublon(s) ignoré(s) sur {report.totalTrouves}{' '}
          lien(s) trouvé(s).
          {report.glossaire ? ' Glossaire du jour généré.' : ''}
          {report.notes && report.notes.length ? (
            <ul className="news-log" style={{ marginTop: 6 }}>
              {report.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          <ul className="news-log" style={{ marginTop: 6 }}>
            {report.sources.map((s, i) => (
              <li key={i}>
                {s.name} : {s.found} lien(s) · {s.nouveaux} nouveau(x) {s.error ? `· erreur : ${s.error}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page Admin                                                          */
/* ------------------------------------------------------------------ */

export default function AdminPage() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [sections, setSections] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [themes, setThemes] = useState([]);
  const [newsSources, setNewsSources] = useState([]);
  const [addingNews, setAddingNews] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [adding, setAdding] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [u, s, sc, t, ns] = await Promise.all([
        api.get('/api/admin/users'),
        api.get('/api/admin/methodology'),
        api.get('/api/admin/step-schemas'),
        api.get('/api/admin/themes'),
        api.get('/api/admin/news-sources'),
      ]);
      setUsers(u);
      setSections(s);
      setSchemas(sc);
      setThemes(t);
      setNewsSources(ns);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function refreshNewsSources() {
    try {
      setNewsSources(await api.get('/api/admin/news-sources'));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleNewsScan() {
    setError(null);
    setNotice(null);
    try {
      return await api.post('/api/admin/news/run');
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async function resetNewsSources() {
    if (!window.confirm('Rétablir les 10 sources par défaut (sans toucher aux existantes) ?')) return;
    setError(null);
    try {
      const data = await api.post('/api/admin/news-sources/reset');
      setNotice(data.message || 'Sources par défaut restaurées.');
      await refreshNewsSources();
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshUsers() {
    try {
      setUsers(await api.get('/api/admin/users'));
    } catch (err) {
      setError(err.message);
    }
  }

  async function invite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api.post('/api/admin/users', { email: inviteEmail.trim() });
      setInviteEmail('');
      setNotice(data.message || 'Invitation envoyée.');
      await refreshUsers();
    } catch (err) {
      setError(err.message);
      await refreshUsers().catch(() => {});
    } finally {
      setInviteBusy(false);
    }
  }

  async function resendInvite(id) {
    setError(null);
    setNotice(null);
    try {
      const data = await api.post(`/api/admin/users/${id}/resend-invite`);
      setNotice(data.message || 'Invitation renvoyée.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Supprimer cet utilisateur ? Ses sessions resteront en base mais ne lui seront plus accessibles.')) return;
    setError(null);
    try {
      await api.del(`/api/admin/users/${id}`);
      await refreshUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSaved(saved, wasNew) {
    setSections((prev) => (wasNew ? [saved, ...prev] : prev.map((s) => (s._id === saved._id ? saved : s))));
  }

  function handleDeleted(id) {
    setSections((prev) => prev.filter((s) => s._id !== id));
  }

  async function addTheme(e) {
    e.preventDefault();
    const label = e.target.label.value.trim();
    const order = Number(e.target.order.value || 0);
    if (!label) return;
    setError(null);
    try {
      const created = await api.post('/api/admin/themes', { label, order });
      setThemes((prev) => [...prev, created].sort((a, b) => a.order - b.order));
      e.target.reset();
    } catch (err) {
      setError(err.message);
    }
  }

  function dateFr(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 0 }}>Administration</h1>
      <p className="muted">
        Invitez des utilisateurs par e-mail (ils configureront leur mot de passe via le lien reçu) et
        gérez la méthodologie, les schémas de sortie et les thèmes.
      </p>

      <div className="tabs">
        <button className={`tab ${tab === 'users' ? 'on' : ''}`} onClick={() => setTab('users')}>
          Utilisateurs ({users.length})
        </button>
        <button className={`tab ${tab === 'methodology' ? 'on' : ''}`} onClick={() => setTab('methodology')}>
          Méthodologie ({sections.length})
        </button>
        <button className={`tab ${tab === 'schemas' ? 'on' : ''}`} onClick={() => setTab('schemas')}>
          Schémas de sortie ({schemas.length})
        </button>
        <button className={`tab ${tab === 'themes' ? 'on' : ''}`} onClick={() => setTab('themes')}>
          Thèmes ({themes.length})
        </button>
        <button className={`tab ${tab === 'news' ? 'on' : ''}`} onClick={() => setTab('news')}>
          News — sources ({newsSources.length})
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
      {notice ? (
        <div className="alert alert-success">
          {notice}
          <button type="button" className="btn-ghost" style={{ marginLeft: 12 }} onClick={() => setNotice(null)}>
            Fermer
          </button>
        </div>
      ) : null}
      {loading ? <p className="muted">Chargement…</p> : null}

      {/* ---------------- Utilisateurs ---------------- */}
      {tab === 'users' ? (
        <div>
          <form className="admin-item" onSubmit={invite}>
            <h3 style={{ marginTop: 0 }}>Inviter un utilisateur</h3>
            <p className="muted">
              Un e-mail (Resend) sera envoyé avec un lien de configuration du mot de passe, valable
              48 h.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
                E-mail
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="etudiant@exemple.fr"
                  required
                />
              </label>
              <button type="submit" className="btn-primary" disabled={inviteBusy || !inviteEmail.trim()}>
                {inviteBusy ? 'Envoi…' : 'Inviter'}
              </button>
            </div>
          </form>

          {users.map((u) => (
            <div className="admin-item" key={u._id} style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong>{u.email}</strong>{' '}
                  {u.role === 'admin' ? (
                    <span className="badge badge-progress">admin</span>
                  ) : u.pending ? (
                    <span className="badge" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                      Invitation en attente
                    </span>
                  ) : (
                    <span className="badge badge-done">utilisateur actif</span>
                  )}
                  <div className="muted">Inscrit le {dateFr(u.createdAt)}</div>
                </div>
                <div className="session-actions">
                  {u.role !== 'admin' && u.pending ? (
                    <button type="button" className="btn-ghost" onClick={() => resendInvite(u._id)}>
                      Renvoyer l’invitation
                    </button>
                  ) : null}
                  {u.role !== 'admin' ? (
                    <button type="button" className="btn-danger" onClick={() => deleteUser(u._id)}>
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ---------------- Méthodologie ---------------- */}
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
            <MethodologyEditor key={s._id} item={s} onSaved={handleSaved} onDeleted={handleDeleted} />
          ))}
        </div>
      ) : null}

      {/* ---------------- Schémas ---------------- */}
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

      {/* ---------------- Thèmes ---------------- */}
      {tab === 'themes' ? (
        <div>
          <form
            className="admin-item"
            onSubmit={addTheme}
            style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 12, alignItems: 'end' }}
          >
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
            <ThemeEditorItem
              key={t._id}
              item={t}
              onSaved={(saved) => setThemes((prev) => [...prev.filter((x) => x._id !== t._id), saved].sort((a, b) => a.order - b.order))}
              onDeleted={(id) => setThemes((prev) => prev.filter((x) => x._id !== id))}
            />
          ))}
        </div>
      ) : null}

      {/* ---------------- News : sources & scraping ---------------- */}
      {tab === 'news' ? (
        <div>
          <NewsScanPanel onScan={handleNewsScan} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 12 }}>
            <button type="button" className="btn-ghost" onClick={resetNewsSources}>
              Restaurer les 10 sources par défaut
            </button>
            {!addingNews ? (
              <button type="button" className="btn-primary" onClick={() => setAddingNews(true)}>
                + Ajouter une source
              </button>
            ) : null}
          </div>
          {addingNews ? (
            <NewsSourceEditor
              item={null}
              onSaved={(saved) => {
                setNewsSources((prev) => [saved, ...prev]);
                setAddingNews(false);
              }}
            />
          ) : null}
          {newsSources.map((src) => (
            <NewsSourceEditor
              key={src._id}
              item={src}
              onSaved={(saved) => setNewsSources((prev) => prev.map((x) => (x._id === saved._id ? saved : x)))}
              onDeleted={(id) => setNewsSources((prev) => prev.filter((x) => x._id !== id))}
            />
          ))}
          {newsSources.length === 0 ? (
            <div className="empty">
              Aucune source configurée. Cliquez sur « Restaurer les 10 sources par défaut » pour
              démarrer la veille IA / Big Data.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
