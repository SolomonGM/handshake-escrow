import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import { toast } from '../utils/toast';

const emptyAgreement = {
  category: 'tangible_goods',
  title: '',
  description: '',
  deliverables: '',
  deliveryMethod: '',
  deliveryDeadline: '',
  inspectionPeriodHours: 24,
  acceptanceCriteria: '',
  refundTerms: ''
};

const mapValue = (mapLike, key) => Boolean(mapLike && key && mapLike[String(key)] === true);

const toLocalDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toForm = (agreement) => agreement ? {
  category: agreement.category || 'other',
  title: agreement.title || '',
  description: agreement.description || '',
  deliverables: (agreement.deliverables || []).join('\n'),
  deliveryMethod: agreement.deliveryMethod || '',
  deliveryDeadline: toLocalDateTime(agreement.deliveryDeadline),
  inspectionPeriodHours: agreement.inspectionPeriodHours || 24,
  acceptanceCriteria: (agreement.acceptanceCriteria || []).join('\n'),
  refundTerms: agreement.refundTerms || ''
} : emptyAgreement;

const riskTheme = {
  low: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
  medium: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
  high: 'border-red-400/35 bg-red-400/10 text-red-200'
};

const severityColor = {
  info: 'text-sky-300',
  low: 'text-emerald-300',
  medium: 'text-amber-300',
  high: 'text-orange-300',
  critical: 'text-red-300'
};

const TradeSafetyCopilot = ({ ticket, user, token, apiUrl, isReadOnly, onTicketChange }) => {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState(emptyAgreement);

  const agreement = ticket?.dealAgreement;
  const assessment = ticket?.safetyAssessment;
  const userId = String(user?._id || '');
  const userConfirmedAgreement = mapValue(agreement?.confirmations, userId);
  const userAcknowledged = mapValue(assessment?.acknowledgements, userId);
  const agreementReady = Boolean(agreement?.confirmedAt);
  const canEdit = Boolean(
    ticket?.dealAmountConfirmed &&
    !ticket?.feesConfirmed &&
    !ticket?.transactionDetected &&
    !isReadOnly
  );
  const needsSetup = ticket?.safetyReviewRequired && ticket?.dealAmountConfirmed && !agreement;
  const shouldShow = ticket?.safetyReviewRequired || agreement || assessment || (ticket?.liveSafetySignals || []).length;

  useEffect(() => {
    setForm(toForm(agreement));
    setEditing(Boolean(needsSetup));
  }, [agreement, needsSetup]);

  const agreementDigest = agreement?.digest || '';
  const facts = useMemo(() => [
    ...(agreement?.deliverables || []),
    ...(agreement?.acceptanceCriteria || [])
  ], [agreement]);

  if (!shouldShow) return null;

  const request = async (label, method, path, data = {}) => {
    setBusy(label);
    try {
      const response = await axios({
        method,
        url: `${apiUrl}/tickets/${encodeURIComponent(ticket.ticketId)}${path}`,
        data,
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.ticket) onTicketChange(response.data.ticket);
      toast.success(response.data.message || 'Safety workflow updated');
      return response.data;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Safety workflow update failed');
      return null;
    } finally {
      setBusy('');
    }
  };

  const saveAgreement = async (event) => {
    event.preventDefault();
    const result = await request('save', 'put', '/agreement', {
      ...form,
      deliverables: form.deliverables.split('\n').map((item) => item.trim()).filter(Boolean),
      acceptanceCriteria: form.acceptanceCriteria.split('\n').map((item) => item.trim()).filter(Boolean),
      deliveryDeadline: form.deliveryDeadline ? new Date(form.deliveryDeadline).toISOString() : null,
      inspectionPeriodHours: Number(form.inspectionPeriodHours)
    });
    if (result) setEditing(false);
  };

  const inputClass = 'w-full rounded-lg border border-n-6 bg-n-8 px-3 py-2.5 text-sm text-n-1 outline-none transition-colors placeholder:text-n-5 focus:border-emerald-400/60';

  return (
    <div className="max-w-5xl mx-auto mb-6 overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/10 via-n-8 to-violet-500/10 shadow-xl">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-6"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-cyan-200">Safety Copilot</span>
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
              AI + rules
            </span>
            {assessment?.riskLevel && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${riskTheme[assessment.riskLevel]}`}>
                {assessment.riskLevel} review · {assessment.score}/100
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-n-4">Clarifies the deal, detects manipulation signals, and organizes evidence. It cannot move funds or decide disputes.</p>
        </div>
        <span className="text-lg text-n-3">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-n-6/80 px-4 py-5 sm:px-6">
          {!ticket.dealAmountConfirmed && (
            <p className="rounded-lg border border-n-6 bg-n-8/70 p-3 text-sm text-n-3">Confirm the roles and amount first. The agreement workflow will then unlock.</p>
          )}

          {editing && canEdit ? (
            <form onSubmit={saveAgreement} className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-medium text-n-3">Trade type
                <select className={`${inputClass} mt-1`} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  <option value="tangible_goods">Physical goods</option>
                  <option value="digital_asset">Digital asset</option>
                  <option value="online_service">Online service</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-xs font-medium text-n-3">Specific deal title
                <input className={`${inputClass} mt-1`} value={form.title} maxLength={120} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Used RTX 5090, serial recorded" />
              </label>
              <label className="text-xs font-medium text-n-3 md:col-span-2">Item condition or service scope
                <textarea className={`${inputClass} mt-1 min-h-24`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe exactly what is included and excluded." />
              </label>
              <label className="text-xs font-medium text-n-3">Deliverables — one per line
                <textarea className={`${inputClass} mt-1 min-h-28`} value={form.deliverables} onChange={(event) => setForm({ ...form, deliverables: event.target.value })} placeholder={'Item with matching serial number\nOriginal accessories'} />
              </label>
              <label className="text-xs font-medium text-n-3">Acceptance criteria — one per line
                <textarea className={`${inputClass} mt-1 min-h-28`} value={form.acceptanceCriteria} onChange={(event) => setForm({ ...form, acceptanceCriteria: event.target.value })} placeholder={'Powers on and passes test\nNo undisclosed damage'} />
              </label>
              <label className="text-xs font-medium text-n-3">Delivery and proof method
                <textarea className={`${inputClass} mt-1 min-h-20`} value={form.deliveryMethod} onChange={(event) => setForm({ ...form, deliveryMethod: event.target.value })} placeholder="Tracked courier, signature, serial-number photos..." />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-n-3">Deadline
                  <input type="datetime-local" className={`${inputClass} mt-1`} value={form.deliveryDeadline} onChange={(event) => setForm({ ...form, deliveryDeadline: event.target.value })} />
                </label>
                <label className="text-xs font-medium text-n-3">Inspection hours
                  <input type="number" min="1" max="720" className={`${inputClass} mt-1`} value={form.inspectionPeriodHours} onChange={(event) => setForm({ ...form, inspectionPeriodHours: event.target.value })} />
                </label>
              </div>
              <label className="text-xs font-medium text-n-3 md:col-span-2">Failure, return, rework, and refund terms
                <textarea className={`${inputClass} mt-1 min-h-24`} value={form.refundTerms} onChange={(event) => setForm({ ...form, refundTerms: event.target.value })} placeholder="State the outcome for non-delivery, missed deadline, or failed acceptance criteria." />
              </label>
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <button disabled={Boolean(busy)} className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
                  {busy === 'save' ? 'Saving…' : 'Save and confirm my proposal'}
                </button>
                {agreement && <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-n-6 px-4 py-2.5 text-sm text-n-3">Cancel edit</button>}
              </div>
            </form>
          ) : agreement ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-n-6 bg-n-8/70 p-4 md:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-n-4">Agreement v{agreement.version} · {agreement.category?.replaceAll('_', ' ')}</p>
                  <h3 className="mt-1 text-base font-bold text-n-1">{agreement.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-n-3">{agreement.description}</p>
                  <div className="mt-3 space-y-1 text-xs text-n-3">
                    {facts.map((fact, index) => <p key={`${fact}-${index}`}>• {fact}</p>)}
                  </div>
                </div>
                <div className="rounded-xl border border-n-6 bg-n-8/70 p-4 text-xs text-n-3">
                  <p><span className="text-n-5">Deadline:</span><br />{agreement.deliveryDeadline ? new Date(agreement.deliveryDeadline).toLocaleString() : 'Not set'}</p>
                  <p className="mt-3"><span className="text-n-5">Inspection:</span><br />{agreement.inspectionPeriodHours} hours</p>
                  <p className="mt-3 break-all"><span className="text-n-5">Agreement fingerprint:</span><br />{agreementDigest.slice(0, 16)}…</p>
                </div>
              </div>
              <div className="rounded-lg border border-n-6 bg-n-8/60 p-3 text-xs text-n-3">
                <strong className="text-n-1">Delivery proof:</strong> {agreement.deliveryMethod}<br />
                <strong className="text-n-1">Failure outcome:</strong> {agreement.refundTerms}
              </div>
              {!agreementReady && !isReadOnly && (
                <div className="flex flex-wrap gap-3">
                  {!userConfirmedAgreement ? <>
                    <button disabled={Boolean(busy)} onClick={() => request('confirm', 'post', '/agreement/confirm', { confirmed: true, digest: agreementDigest })} className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">Confirm these exact terms</button>
                    <button disabled={Boolean(busy)} onClick={() => request('reject', 'post', '/agreement/confirm', { confirmed: false, digest: agreementDigest })} className="rounded-lg border border-red-400/40 px-4 py-2.5 text-sm font-semibold text-red-300 disabled:opacity-50">Reject and revise</button>
                  </> : <p className="self-center text-sm text-amber-300">You confirmed this version. Waiting for the other party.</p>}
                  {canEdit && <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-n-6 px-4 py-2.5 text-sm text-n-3">Revise proposal</button>}
                </div>
              )}
              {agreementReady && canEdit && <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-n-6 px-4 py-2 text-xs text-n-3">Revise before funding</button>}
            </div>
          ) : null}

          {assessment?.analysisId && (
            <div className={`rounded-xl border p-4 ${riskTheme[assessment.riskLevel] || riskTheme.medium}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">Pre-payment risk review</h3>
                <span className="text-xs uppercase">{assessment.engine === 'rules-v1' ? 'Rules fallback' : 'AI + deterministic rules'}</span>
              </div>
              <p className="mt-2 text-sm text-n-2">{assessment.summary}</p>
              {(assessment.flags || []).length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {assessment.flags.map((flag) => (
                    <div key={flag.code} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className={`text-xs font-bold uppercase ${severityColor[flag.severity] || 'text-n-3'}`}>{flag.severity} · {flag.title}</p>
                      <p className="mt-1 text-xs text-n-3">{flag.explanation}</p>
                      <p className="mt-2 text-xs text-n-2"><strong>Safer action:</strong> {flag.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                {!userAcknowledged && !isReadOnly && (
                  <button disabled={Boolean(busy)} onClick={() => request('ack', 'post', '/safety/acknowledge', { analysisId: assessment.analysisId })} className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">I reviewed this report</button>
                )}
                {userAcknowledged && <span className="self-center text-sm text-emerald-200">You reviewed this version.</span>}
                {!ticket.fundsReleased && !isReadOnly && <button disabled={Boolean(busy)} onClick={() => request('analyze', 'post', '/safety/analyze')} className="rounded-lg border border-cyan-300/30 px-4 py-2.5 text-sm text-cyan-100 disabled:opacity-50">Run a fresh check</button>}
              </div>
            </div>
          )}

          {(ticket.liveSafetySignals || []).length > 0 && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4">
              <h3 className="text-sm font-bold text-red-200">Live conversation alerts</h3>
              {(ticket.liveSafetySignals || []).slice(-5).map((signal, index) => (
                <p key={`${signal.code}-${index}`} className="mt-2 text-xs text-n-2"><strong>{signal.title}:</strong> {signal.recommendation}</p>
              ))}
            </div>
          )}

          {(ticket.transactionConfirmed || ticket.status === 'disputed') && (
            <div className="rounded-xl border border-violet-400/25 bg-violet-400/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-violet-200">Neutral evidence brief</h3>
                  <p className="mt-1 text-xs text-n-4">Organizes recorded facts for people. It never recommends a payout or refund.</p>
                </div>
                {!isReadOnly && <button disabled={Boolean(busy)} onClick={() => request('brief', 'post', '/safety/evidence-brief')} className="rounded-lg border border-violet-300/30 px-4 py-2 text-xs font-semibold text-violet-100 disabled:opacity-50">{ticket.aiEvidenceBrief ? 'Refresh brief' : 'Build evidence brief'}</button>}
              </div>
              {ticket.aiEvidenceBrief && (
                <div className="mt-4 space-y-3 text-xs text-n-3">
                  <p>{ticket.aiEvidenceBrief.summary}</p>
                  {(ticket.aiEvidenceBrief.chronology || []).map((item, index) => <p key={`time-${index}`}>• {item}</p>)}
                  {(ticket.aiEvidenceBrief.evidenceMissing || []).length > 0 && <p className="text-amber-200"><strong>Missing:</strong> {ticket.aiEvidenceBrief.evidenceMissing.join(' · ')}</p>}
                  <p className="text-n-5">{ticket.aiEvidenceBrief.disclaimer}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

TradeSafetyCopilot.propTypes = {
  ticket: PropTypes.object,
  user: PropTypes.object,
  token: PropTypes.string,
  apiUrl: PropTypes.string.isRequired,
  isReadOnly: PropTypes.bool,
  onTicketChange: PropTypes.func.isRequired
};

export default TradeSafetyCopilot;
