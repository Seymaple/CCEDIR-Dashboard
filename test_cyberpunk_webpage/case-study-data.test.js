const test = require('node:test');
const assert = require('node:assert/strict');
const { getCaseStudyInsights } = require('./case-study-data.js');

test('computes meaningful case study insights from sample session data', () => {
  const sampleSessions = [
    {
      events: [
        {
          Timestamp: '2024-01-01T09:00:00',
          Activity: 'Lecture',
          Role: 'Instructor',
          DurationMs: 1800000
        },
        {
          Timestamp: '2024-01-01T09:20:00',
          Activity: 'Practice',
          Role: 'Student',
          DurationMs: 900000
        },
        {
          Timestamp: '2024-01-01T09:35:00',
          Activity: 'Lecture',
          Role: 'Instructor',
          DurationMs: 1200000
        }
      ]
    }
  ];

  const insights = getCaseStudyInsights(sampleSessions);

  assert.equal(insights.loadedSessions, 1);
  assert.equal(insights.totalEvents, 3);
  assert.equal(insights.topActivityLabel, 'Lecture');
  assert.equal(insights.topActivityCount, 2);
  assert.equal(insights.topTransitionLabel, 'Lecture → Practice');
  assert.equal(insights.mostTransitionActivity, 'Lecture');
  assert.ok(insights.concentrationShare > 0);
  assert.ok(insights.focusBreakdown.some((item) => item.label === 'Instructor'));
  assert.ok(insights.activityBreakdown.length >= 2);
});

test('counts transitions within each session instead of across session boundaries', () => {
  const sampleSessions = [
    {
      events: [
        { Timestamp: '2024-01-01T09:00:00', Activity: 'Lecture', Role: 'Instructor', DurationMs: 600000 },
        { Timestamp: '2024-01-01T09:10:00', Activity: 'Content Question Asked', Role: 'Instructor', DurationMs: 300000 }
      ]
    },
    {
      events: [
        { Timestamp: '2024-01-02T09:00:00', Activity: 'Lecture', Role: 'Instructor', DurationMs: 600000 },
        { Timestamp: '2024-01-02T09:10:00', Activity: 'Group Work', Role: 'Student', DurationMs: 300000 }
      ]
    }
  ];

  const insights = getCaseStudyInsights(sampleSessions);

  assert.equal(insights.transitionCounts['Lecture → Content Question Asked'], 1);
  assert.equal(insights.transitionCounts['Lecture → Group Work'], 1);
  assert.equal(insights.transitionCounts['Content Question Asked → Lecture'], undefined);
  assert.equal(insights.transitionCounts['Group Work → Lecture'], undefined);
});
