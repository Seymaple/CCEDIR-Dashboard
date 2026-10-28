function normalizeLabel(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function findValue(row, keys) {
  if (!row) return '';

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
  }

  return '';
}

function inferActivity(row) {
  const value = findValue(row, ['Activity', 'activity', 'Task', 'task', 'Description', 'description', 'Event', 'event', 'Type', 'type', 'Category', 'category']);
  return value || 'Unspecified activity';
}

function inferRole(row) {
  const value = findValue(row, ['Role', 'role', 'Speaker', 'speaker', 'Focus', 'focus', 'Type', 'type', 'Source', 'source', 'Who', 'who']);
  if (!value) return 'Unspecified';

  const normalized = normalizeLabel(value);
  if (normalized.includes('instructor') || normalized.includes('teacher') || normalized.includes('facilitator')) {
    return 'Instructor';
  }
  if (normalized.includes('student') || normalized.includes('learner') || normalized.includes('participant')) {
    return 'Student';
  }
  if (normalized.includes('system') || normalized.includes('platform') || normalized.includes('tool')) {
    return 'System';
  }

  return value;
}

function formatMinutes(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const leftover = minutes % 60;
  return `${hours}h ${leftover}m`;
}

function getCaseStudyInsights(sessionsData) {
  const allEvents = [];

  (sessionsData || []).forEach((session, sessionIndex) => {
    const sessionEvents = Array.isArray(session?.events) ? session.events : [];
    sessionEvents.forEach((event) => {
      if (!event) return;

      const startTime = event.StartTime ? new Date(event.StartTime) : (event.Timestamp ? new Date(event.Timestamp) : null);
      const endTime = event.EndTime ? new Date(event.EndTime) : (startTime ? new Date(startTime.getTime() + (Number(event.DurationMs) || 0)) : null);
      const durationMs = Number(event.DurationMs) || (startTime && endTime ? endTime - startTime : 0);

      allEvents.push({
        ...event,
        _sessionIndex: sessionIndex,
        StartTime: startTime,
        EndTime: endTime,
        DurationMs: durationMs
      });
    });
  });

  if (allEvents.length === 0) {
    return {
      loadedSessions: 0,
      totalEvents: 0,
      totalTrackedMs: 0,
      topActivityLabel: 'No activity data',
      topActivityMs: 0,
      topActivityShare: 0,
      topActivityCount: 0,
      concentrationShare: 0,
      concentrationSummary: 'Upload data to see whether the course is concentrated or balanced.',
      focusBreakdown: [],
      activityBreakdown: [],
      pacingSummary: 'Upload data to review pacing trends.',
      longestGapMinutes: 0,
      averageGapMinutes: 0,
      sessionSpread: [],
      transitionCounts: {},
      topTransitionLabel: 'No transitions detected',
      topTransitionCount: 0,
      mostTransitionActivity: 'No activity data',
      transitionSummary: 'Upload data to see how often the class moved between activities.'
    };
  }

  const activityTotals = {};
  const activityCounts = {};
  const focusCounts = {};
  const sessionCounts = {};
  let totalTrackedMs = 0;

  allEvents.forEach((event) => {
    const activityLabel = inferActivity(event);
    const focusLabel = inferRole(event);
    const durationMs = Number(event.DurationMs) || 0;

    totalTrackedMs += durationMs;
    activityTotals[activityLabel] = (activityTotals[activityLabel] || 0) + durationMs;
    activityCounts[activityLabel] = (activityCounts[activityLabel] || 0) + 1;
    focusCounts[focusLabel] = (focusCounts[focusLabel] || 0) + 1;

    const sessionLabel = `Session ${Number(event._sessionIndex) + 1}`;
    sessionCounts[sessionLabel] = (sessionCounts[sessionLabel] || 0) + 1;
  });

  const activityBreakdown = Object.entries(activityTotals)
    .map(([label, totalMs]) => ({
      label,
      totalMs,
      count: activityCounts[label] || 0,
      share: totalTrackedMs > 0 ? (totalMs / totalTrackedMs) * 100 : 0
    }))
    .sort((a, b) => b.totalMs - a.totalMs);

  const transitionCounts = {};
  const transitionActivityCounts = {};

  (sessionsData || []).forEach((session) => {
    const sessionEvents = [...(Array.isArray(session?.events) ? session.events : [])]
      .map((event) => {
        const startTime = event?.StartTime ? new Date(event.StartTime) : (event?.Timestamp ? new Date(event.Timestamp) : null);
        const endTime = event?.EndTime ? new Date(event.EndTime) : (startTime ? new Date(startTime.getTime() + (Number(event?.DurationMs) || 0)) : null);
        return {
          ...event,
          StartTime: startTime,
          EndTime: endTime,
          DurationMs: Number(event?.DurationMs) || (startTime && endTime ? endTime - startTime : 0)
        };
      })
      .filter((event) => event && event.StartTime instanceof Date && !Number.isNaN(event.StartTime.getTime()))
      .sort((a, b) => a.StartTime - b.StartTime);

    let previousActivity = null;

    sessionEvents.forEach((event) => {
      const currentActivity = inferActivity(event);

      if (previousActivity && previousActivity !== currentActivity) {
        const transitionLabel = `${previousActivity} → ${currentActivity}`;
        transitionCounts[transitionLabel] = (transitionCounts[transitionLabel] || 0) + 1;
        transitionActivityCounts[previousActivity] = (transitionActivityCounts[previousActivity] || 0) + 1;
        transitionActivityCounts[currentActivity] = (transitionActivityCounts[currentActivity] || 0) + 1;
      }

      previousActivity = currentActivity;
    });
  });

  const transitionEntries = Object.entries(transitionCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const topTransitionEntries = transitionEntries.filter(([, count]) => count === transitionEntries[0]?.[1]);
  const topTransition = topTransitionEntries[0] || null;
  const mostTransitionActivityEntry = Object.entries(transitionActivityCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;

  const topActivity = activityBreakdown[0] || { label: 'No activity data', totalMs: 0, count: 0, share: 0 };

  const topThreeTotal = activityBreakdown.slice(0, 3).reduce((sum, item) => sum + item.totalMs, 0);
  const concentrationShare = totalTrackedMs > 0 ? (topThreeTotal / totalTrackedMs) * 100 : 0;

  const sortedEvents = [...allEvents]
    .filter((event) => event.StartTime instanceof Date && !Number.isNaN(event.StartTime.getTime()))
    .sort((a, b) => a.StartTime - b.StartTime);

  let totalGapMs = 0;
  let gapCount = 0;
  let longestGapMs = 0;

  for (let i = 1; i < sortedEvents.length; i += 1) {
    const previous = sortedEvents[i - 1];
    const current = sortedEvents[i];
    const previousEnd = previous.EndTime instanceof Date && !Number.isNaN(previous.EndTime.getTime())
      ? previous.EndTime
      : new Date(previous.StartTime.getTime() + (Number(previous.DurationMs) || 0));
    const currentStart = current.StartTime;
    const gapMs = currentStart - previousEnd;

    if (gapMs > 0) {
      totalGapMs += gapMs;
      gapCount += 1;
      longestGapMs = Math.max(longestGapMs, gapMs);
    }
  }

  const averageGapMinutes = gapCount > 0 ? Math.round((totalGapMs / gapCount) / 60000) : 0;

  const focusBreakdown = Object.entries(focusCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const sessionSpread = Object.entries(sessionCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  let concentrationSummary = 'The activity mix is fairly balanced.';
  if (concentrationShare > 70) {
    concentrationSummary = 'A small cluster of activities dominates the session flow.';
  } else if (concentrationShare > 40) {
    concentrationSummary = 'Several activities carry meaningful weight, without a single clear leader.';
  }

  let pacingSummary = 'The sequence looks steady across the session.';
  let transitionSummary = 'The activity flow stays mostly stable from one event to the next.';

  if (topTransition) {
    if (topTransitionEntries.length > 1) {
      pacingSummary = `The top transition is tied with ${topTransitionEntries[1][0]} at ${topTransitionEntries[0][1]} times.`;
      transitionSummary = `These transitions happened the most often in the uploaded sequence.`;
    } else {
      pacingSummary = `The most common transition was ${topTransition[0]}, which appeared ${topTransition[1]} times.`;
      transitionSummary = `The class most often moved from ${topTransition[0].split(' → ')[0]} to ${topTransition[0].split(' → ')[1]}.`;
    }
  }

  if (longestGapMs > 1800000) {
    pacingSummary = 'A long pause stands out, which may suggest a break or a shift in activity.';
  } else if (averageGapMinutes > 5) {
    pacingSummary = 'Events seem spaced out, indicating a slower pacing pattern.';
  }

  return {
    loadedSessions: sessionsData?.length || 0,
    totalEvents: allEvents.length,
    totalTrackedMs,
    topActivityLabel: topActivity.label,
    topActivityMs: topActivity.totalMs,
    topActivityShare: topActivity.share,
    topActivityCount: topActivity.count,
    concentrationShare,
    concentrationSummary,
    focusBreakdown,
    activityBreakdown,
    pacingSummary,
    longestGapMinutes: Math.round(longestGapMs / 60000),
    averageGapMinutes,
    sessionSpread,
    transitionCounts,
    topTransitionLabel: topTransition ? topTransition[0] : 'No transitions detected',
    topTransitionCount: topTransition ? topTransition[1] : 0,
    mostTransitionActivity: mostTransitionActivityEntry ? mostTransitionActivityEntry[0] : 'No activity data',
    transitionSummary
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getCaseStudyInsights,
    inferActivity,
    inferRole
  };
}

if (typeof window !== 'undefined') {
  window.CaseStudyData = {
    getCaseStudyInsights,
    inferActivity,
    inferRole
  };
}
