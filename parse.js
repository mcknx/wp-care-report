// Turns Claude's reply into a safe care report. Embedded verbatim in workflow.json's "Parse" node; tested by parse.check.mjs.
// text: bridge reply (or undefined if the bridge failed), data: the run's real check data (the only source of numbers).
function parseReport(text, data) {
  const rank = { green: 0, amber: 1, red: 2 };
  const h = data.health || {};
  const outdated = (h.plugins || []).filter(p => p.update);
  const updates = outdated.length + (h.theme_updates || 0) + (h.core_update ? 1 : 0);
  const noBackup = data.backup_age_days == null || data.backup_age_days > data.backup_max_age_days;
  // The data sets a floor Claude can raise but never lower: down/unreadable = red; updates, no recent backup, errors, slow = amber.
  const floor = (!data.uptime.ok || !h.wp_version) ? 'red'
    : (updates || noBackup || h.debug_errors_24h || !data.lighthouse || data.lighthouse.score < 50) ? 'amber' : 'green';

  // Numbers guard: every number in the report must appear in the data (1,234 → 1234; 07 → 7), else that text is replaced.
  const nums = s => (String(s).replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)*/g) || []).map(n => n.replace(/^0+(?=\d)/, ''));
  const allowed = new Set(nums(JSON.stringify(data)));
  let guarded = 0;
  const str = (v, max) => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, max) : '';
  const checked = s => { if (!s || nums(s).every(n => allowed.has(n))) return s; guarded++; return ''; };

  let r = {};
  try {
    if (typeof text !== 'string') throw new Error('bridge failed');
    const t = text.replace(/```(?:json)?/g, '');
    r = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) || {};
  } catch (e) { r = {}; }

  const status = rank[r.status] >= rank[floor] ? r.status : floor;
  const headline = checked(str(r.headline, 160)) || {
    green: 'Your website is healthy this week — nothing needs your attention.',
    amber: 'Your website is up, but a few things need attention this week.',
    red: 'Your website needs urgent attention.' }[status];
  let sections = (Array.isArray(r.sections) ? r.sections : []).slice(0, 6).map(s => ({
    title: checked(str(s && s.title, 60)) || 'This week',
    body: checked(str(s && s.body, 700)) || 'We checked this; the exact figures are in the table below.',
  }));
  if (!sections.length) sections = [{ title: 'This week', body: 'The written summary is not available this week; the exact figures are in the table below.' }];
  const actions = (Array.isArray(r.actions) ? r.actions : []).slice(0, 5).map(a => ({
    what: checked(str(a && a.what, 160)), why: checked(str(a && a.why, 300)),
    effort: ['quick', 'medium', 'large'].includes(a && a.effort) ? a.effort : 'medium',
  })).filter(a => a.what && a.why);

  // Belt and braces: the things the data says must be done always reach the owner, even if the write-up missed them.
  const has = re => actions.some(a => re.test(a.what + ' ' + a.why));
  if (!data.uptime.ok && !has(/offline|down|online/i))
    actions.unshift({ what: 'Get the website back online', why: 'Patients could not open the site during this check.', effort: 'quick' });
  if (updates && !has(/updat/i))
    actions.push({ what: 'Install the pending updates' + (outdated.length ? ' (' + outdated.map(p => p.slug).join(', ') + ')' : ''),
      why: 'Updates close security holes; out-of-date plugins are the most common way small sites get broken into.', effort: 'quick' });
  if (noBackup && !has(/backup/i))
    actions.push({ what: 'Take a fresh backup and keep the weekly backup running', why: 'There is no recent backup, so a broken update or a hack could not be undone.', effort: 'quick' });
  if (!actions.length) actions.push({ what: 'No action needed — keep the weekly checks running', why: 'Everything we checked is healthy.', effort: 'quick' });
  return { status, headline, sections, actions, guarded };
}
