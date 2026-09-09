export function setupWebsiteUpdate({ selectedId, postJson, refresh, pendingVisibility }) {
  const $ = id => document.getElementById(id);
  let review = null;
  let busy = false;
  let live = null;
  let timer;
  let attempts = 0;
  const storageKey = 'bus123-website-update';
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
  const notice = (message, state = '') => { $('websiteUpdateNotice').textContent = message; $('websiteUpdateNotice').dataset.state = state; };
  function setBusy(value) {
    busy = value;
    $('updateStudentWebsite').disabled = value;
    $('confirmWebsiteUpdate').disabled = value;
    $('setCurrentLessonButton').disabled = value || $('setCurrentLessonButton').dataset.current === 'true';
    $('lessonPicker').disabled = value;
  }
  async function checkLive() {
    try {
      const response = await fetch(`/api/course/website-status${pending ? `?commit=${encodeURIComponent(pending.commit)}` : ''}`);
      if (!response.ok) throw new Error('Live verification is unavailable. Restart Mission Control and try again.');
      live = await response.json();
      $('liveWebsiteLesson').textContent = live.verified ? `Live website: ${live.title}` : 'Live website: Unable to verify';
      $('liveWebsiteChecked').textContent = live.verified
        ? `Checked ${new Date(live.checkedAt).toLocaleTimeString()} · ${live.matchesLocal ? 'Matches saved local files' : 'Local files differ from the live website'}`
        : live.error || 'The website is updating or its lesson information does not agree. Try checking again.';
      if (pending) {
        if (live.matchesPublished && live.currentLessonId === pending.lessonId) {
          notice(`Live and verified: ${live.title}. Students can see the updated website.${live.matchesLocal ? '' : ' You also have newer local changes that are not published.'}`, 'success');
          pending = null;
          sessionStorage.removeItem(storageKey);
          clearTimeout(timer);
        } else if (live.deployment?.status === 'completed' && live.deployment.conclusion !== 'success') {
          notice(`GitHub received the update, but website deployment ${live.deployment.conclusion || 'did not succeed'}. Open Deployment details to resolve the failed run, then Check live website.`, 'error');
          clearTimeout(timer);
        } else if (attempts++ < 24) {
          notice('Sent to GitHub. Website updating — checking the live page automatically…', 'pending');
          clearTimeout(timer);
          timer = setTimeout(checkLive, 10000);
        } else {
          notice('Sent to GitHub, but the live update is not verified yet. Check deployment details, then Check live website. Do not publish again just to refresh status.', 'warning');
        }
      }
    } catch (error) {
      $('liveWebsiteLesson').textContent = 'Live website: Unable to verify';
      $('liveWebsiteChecked').textContent = error.message;
      if (pending) notice('Sent to GitHub; live verification is unavailable. Use Check live website to retry.', 'warning');
    }
    return live;
  }
  $('checkLiveWebsite').addEventListener('click', () => { attempts = 0; checkLive(); });
  $('updateStudentWebsite').addEventListener('click', async () => {
    if (busy) return;
    review = null;
    if (pendingVisibility()) { notice('You have unsaved student-access changes. Save or discard them in Student access & publishing first.', 'warning'); return; }
    if (pending) { notice('A published update is still awaiting verification. Check live website before starting another update.', 'warning'); return; }
    const lessonId = selectedId();
    if (!lessonId) { notice('Choose a lesson first.', 'warning'); return; }
    setBusy(true);
    let saved = false;
    try {
      notice('Saving the selected lesson locally and checking the website update…', 'pending');
      const result = await postJson('/api/course/current-lesson', { lessonId });
      saved = true;
      await refresh(result.dashboard);
      const preflight = await postJson('/api/course/publish-preflight', {});
      await checkLive();
      if (!preflight.canPublish) {
        if (preflight.blockers.length) throw new Error(preflight.blockers.map(item => item.detail).join(' '));
        notice(live?.matchesLocal ? 'This lesson is already live and verified. No publication is needed.' : 'No unpublished local changes. Check live website or deployment details to follow the existing update.', live?.matchesLocal ? 'success' : 'warning');
        return;
      }
      review = { ...preflight, lessonId, title: result.currentLessonTitle };
      $('websiteReviewSummary').textContent = `Update the student website from ${live?.verified ? live.title : 'the currently published lesson (unable to verify)'} to ${review.title}.`;
      $('websiteReviewChanges').textContent = preflight.lessonChanges?.join('\n') || 'Publish the saved course homepage changes.';
      $('websiteReviewDetails').textContent = [...preflight.checks.map(item => `${item.title}: ${item.detail}`), '', 'Included files:', ...preflight.includedChanges.map(item => item.path), '', 'Excluded files:', ...preflight.excludedChanges.map(item => item.path), '', ...(preflight.regeneration?.details || []), '', preflight.reviewDiff || ''].join('\n');
      notice('Saved locally. Review the update below; the website changes only after confirmation.', 'pending');
      $('websiteUpdateDialog').showModal();
    } catch (error) {
      notice(`${saved ? 'Saved on this computer; publishing did not complete.' : 'The lesson could not be saved.'} ${error.message}`, 'error');
    } finally { setBusy(false); }
  });
  function cancel() { if (busy) return; review = null; $('websiteUpdateDialog').close(); notice('Saved locally for later. Nothing was sent to GitHub.'); }
  $('cancelWebsiteUpdate').addEventListener('click', cancel);
  $('websiteUpdateDialog').addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  $('confirmWebsiteUpdate').addEventListener('click', async () => {
    if (!review || busy) return;
    setBusy(true);
    notice('Sending the reviewed update to GitHub…', 'pending');
    $('websiteUpdateDialog').close();
    let pushed = false;
    try {
      const result = await postJson('/api/course/publish', { confirmed: true, reviewToken: review.reviewToken, commitMessage: `Set BUS123 current lesson: ${review.title}`.slice(0,120) });
      pushed = true;
      pending = { lessonId: review.lessonId, commit: result.commit };
      sessionStorage.setItem(storageKey, JSON.stringify(pending));
      review = null;
      await refresh(result.dashboard);
      attempts = 0;
      await checkLive();
    } catch (error) {
      review = null;
      if (pushed) { notice('Sent to GitHub; refreshing local status failed. Checking the live website…', 'warning'); await checkLive(); }
      else notice(`Publishing stopped. ${error.message} Review the update again after resolving the issue.`, 'error');
    } finally { setBusy(false); }
  });
  checkLive();
}
